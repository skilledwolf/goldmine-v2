import hashlib
import os
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Series, Exercise
from core.search_utils import extract_exercise_search_texts

import re


MARKER_TOKEN = "GMEXMARKER-"
MARKER_RE = re.compile(rf"{MARKER_TOKEN}(\d+)")


def _replace_markers_with_comments(html: str) -> str:
    # Remove full marker-only paragraphs to avoid extra vertical space in previews.
    html = re.sub(
        rf"<p>\s*{MARKER_TOKEN}(\d+)\s*</p>",
        lambda m: f"<!--GMEX:{m.group(1)}-->",
        html,
        flags=re.IGNORECASE,
    )
    return MARKER_RE.sub(lambda m: f"<!--GMEX:{m.group(1)}-->", html)


def _strip_marker_tokens(text: str) -> str:
    return MARKER_RE.sub("", text)


def _line_has_uncommented_match(line: str, pattern: re.Pattern) -> bool:
    match = pattern.search(line)
    if not match:
        return False
    comment = re.search(r"(?<!\\)%", line)
    if comment and match.start() > comment.start():
        return False
    return True


def _count_pattern_matches(text: str, pattern: re.Pattern) -> int:
    count = 0
    for line in text.splitlines():
        if _line_has_uncommented_match(line, pattern):
            count += 1
    return count


def _inject_markers_for_pattern(text: str, pattern: re.Pattern, count: int) -> tuple[str, int]:
    out: list[str] = []
    idx = 0
    for line in text.splitlines(keepends=True):
        if idx < count and _line_has_uncommented_match(line, pattern):
            idx += 1
            out.append(f"{MARKER_TOKEN}{idx}\n")
        out.append(line)
    return "".join(out), idx


def _inject_exercise_markers(raw_tex: str, exercise_count: int) -> tuple[str, int]:
    if exercise_count <= 0:
        return raw_tex, 0

    patterns = [
        re.compile(r"\\begin\{problem\}", re.IGNORECASE),
        re.compile(r"\\begin\{exercise\}", re.IGNORECASE),
        re.compile(r"\\exercise\s*\{", re.IGNORECASE),
        re.compile(r"\\uebung\s*\{", re.IGNORECASE),
        re.compile(r"\\subsection\*?\s*\{", re.IGNORECASE),
    ]

    for pattern in patterns:
        match_count = _count_pattern_matches(raw_tex, pattern)
        if match_count == exercise_count:
            injected, injected_count = _inject_markers_for_pattern(raw_tex, pattern, exercise_count)
            return injected, injected_count

    return raw_tex, 0


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_include_path(base_dir: Path, ref: str, semester_root: Path) -> Path | None:
    cleaned = (ref or "").strip().strip("{}")
    if not cleaned:
        return None

    candidates: list[Path] = []
    raw = base_dir / cleaned
    candidates.append(raw)
    if not raw.suffix:
        candidates.append(raw.with_suffix(".tex"))

    try:
        semester_root_resolved = semester_root.resolve()
    except OSError:
        semester_root_resolved = semester_root

    for cand in candidates:
        try:
            resolved = cand.resolve()
        except OSError:
            continue
        if not resolved.is_file():
            continue
        try:
            if not resolved.is_relative_to(semester_root_resolved):
                continue
        except AttributeError:  # py<3.9 fallback (not needed on 3.12, kept for safety)
            if semester_root_resolved not in resolved.parents and resolved != semester_root_resolved:
                continue
        return resolved
    return None


def _inline_inputs(tex_path: Path, semester_root: Path, seen: set[Path] | None = None) -> str:
    seen = seen or set()
    try:
        resolved = tex_path.resolve()
    except OSError:
        return ""
    if resolved in seen:
        return ""
    seen.add(resolved)

    try:
        text = tex_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = tex_path.read_text(encoding="latin-1")

    out: list[str] = []
    for line in text.splitlines(keepends=True):
        # Drop TeX's file terminator so pandoc doesn't stop mid-document when we inline.
        if line.strip().lower() == r"\endinput":
            continue
        m = re.match(r"\s*\\(input|include)\{([^}]+)\}", line)
        if m:
            target = _resolve_include_path(tex_path.parent, m.group(2), semester_root)
            if target:
                out.append(_inline_inputs(target, semester_root, seen))
                continue
        out.append(line)
    return "".join(out)


def _restore_eqrefs_to_mathjax(html: str) -> str:
    """
    Pandoc expands \\eqref{label} into anchors such as
    <a data-reference-type="eqref" data-reference="eq:foo">[…]</a>.
    MathJax never sees the macro then, so numbers stay as raw text.

    We only rewrite anchors that clearly target equations:
      - data-reference-type="eqref", or
      - data-reference starts with "eq:" (Pandoc sometimes emits type="ref")

    Other cross-refs (to sections/items like \ref{1c}) are left untouched to
    avoid MathJax inserting “???” when the label is not a math label.
    """
    # Only labels that appear inside TeX math (e.g. `\[\label{eq:foo} ...\]`)
    # are visible to MathJax' TeX input processor.
    math_labels = set(re.findall(r'\\label\{([^}]+)\}', html))

    pattern = re.compile(
        r'<a\s+[^>]*data-reference-type="(?P<type>eqref|ref)"[^>]*data-reference="(?P<label>[^"]+)"[^>]*>[^<]*</a>',
        re.IGNORECASE,
    )

    added_labels: set[str] = set()

    def repl(match: re.Match) -> str:
        ref_type = match.group('type').lower()
        label = match.group('label')
        is_equation = ref_type == 'eqref' or label.startswith('eq:')
        if not is_equation:
            return match.group(0)
        needs_stub = label not in math_labels and label not in added_labels
        if needs_stub:
            added_labels.add(label)
            # Insert a hidden display math with the missing label so MathJax
            # registers it and numbering/refs resolve, without altering layout.
            hidden = f'<span style="display:none">\\[\\label{{{label}}}\\]</span>'
        else:
            hidden = ""
        return f'{hidden}<span class="math inline">\\(\\eqref{{{label}}}\\)</span>'

    return pattern.sub(repl, html)

def _normalize_pandoc_math_envs_for_mathjax(html: str) -> str:
    """
    The pandoc version we ship in Docker may emit `aligned` environments for display math.

    MathJax does not register `\\label{...}` inside `aligned`, so `\\eqref{...}` resolves to ???.
    Converting `aligned` -> `align` preserves the visual layout while enabling labels/refs.
    """
    return html.replace(r"\begin{aligned}", r"\begin{align}").replace(r"\end{aligned}", r"\end{align}")

def _normalize_math_macros_for_mathjax(html: str) -> str:
    """
    Normalize a few legacy LaTeX constructs that pandoc keeps inside math spans,
    but that MathJax does not understand well.

    - `youngtab` macros: replace `\\yng(` / `\\young(` with a MathJax-friendly
      text representation to avoid TeX parser errors.
    - `tabular` inside math: convert to `array` and drop nested `$...$` markers.
      (Some sources embed tabular blocks inside `align*` just for centering.)
    """

    # youngtab: MathJax doesn't implement these macros; render a readable fallback.
    html = html.replace(r"\yng(", r"\mathrm{yng}(").replace(r"\young(", r"\mathrm{young}(")

    # Convert tabular to array when it appears inside math (common in some solutions).
    html = html.replace(r"\begin{tabular}", r"\begin{array}").replace(r"\end{tabular}", r"\end{array}")

    # Some sources put a tabular inside an `align*` block (already in display math) and
    # then still wrap each cell in `$...$`. After converting to `array`, those dollar signs
    # become invalid nested math markers. Remove them.
    def _strip_dollars_in_array(match: re.Match) -> str:
        array_block = match.group(0)
        return array_block.replace("$", "")

    html = re.sub(
        r"\\begin\{array\}\{[^}]+\}[\s\S]*?\\end\{array\}",
        _strip_dollars_in_array,
        html,
        flags=re.MULTILINE,
    )

    # If an align environment wraps nothing but a single array, drop the outer align.
    html = re.sub(
        r"\\begin\{align\*?\}\s*(\\begin\{array\}\{[^}]+\}[\s\S]*?\\end\{array\})\s*\\end\{align\*?\}",
        r"\1",
        html,
        flags=re.MULTILINE,
    )

    return html


def _update_exercise_search_texts(series: Series, html_content: str, stdout=None) -> None:
    exercises = list(series.exercises.order_by("number"))
    if not exercises:
        return

    texts = extract_exercise_search_texts(html_content or "", expected_count=len(exercises))
    if not texts:
        # Clear stale search text if the HTML yielded nothing usable.
        Exercise.objects.filter(series=series).update(search_text="")
        return

    if len(texts) != len(exercises) and stdout:
        stdout.write(
            f"Series {series.id}: HTML produced {len(texts)} sections for {len(exercises)} exercises"
        )

    for idx, ex in enumerate(exercises):
        text = texts[idx] if idx < len(texts) else ""
        Exercise.objects.filter(id=ex.id).update(search_text=text)


def _move_trailing_math_labels_inside_env(tex: str) -> str:
    """
    Some legacy sources place `\\label{...}` immediately *after* a math environment end,
    e.g. `\\end{align}\\label{eq:foo}`. LaTeX still associates this with the preceding
    equation number, but pandoc tends to drop such labels (since they appear outside
    the math block), which breaks \\ref/\\eqref in the HTML preview.
    """
    envs = r"(?:equation|align|gather|multline|alignat|eqnarray|flalign)"
    pattern = re.compile(
        rf"(\\end\{{(?P<env>{envs})\*?\}})\s*(?P<label>\\label\{{[^}}]+\}})(?P<comment>%[^\n]*)?",
        re.MULTILINE,
    )
    return pattern.sub(lambda m: f"{m.group('label')}{m.group('comment') or ''}\n{m.group(1)}", tex)

def _unwrap_single_brace_command(tex: str, command: str) -> str:
    """
    Pandoc drops many unknown commands *and their contents*, e.g. `\\hint{...}`.
    For the HTML preview we prefer to keep the contents (including any math).
    """
    needle = f"\\{command}"
    out: list[str] = []
    i = 0
    n = len(tex)

    while i < n:
        j = tex.find(needle, i)
        if j == -1:
            out.append(tex[i:])
            break
        out.append(tex[i:j])

        k = j + len(needle)
        while k < n and tex[k].isspace():
            k += 1
        if k >= n or tex[k] != "{":
            out.append(tex[j:k])
            i = k
            continue

        # Parse balanced braces, accounting for nested groups and TeX comments.
        depth = 0
        k += 1
        start = k
        while k < n:
            ch = tex[k]
            if ch == "%" and (k == 0 or tex[k - 1] != "\\"):
                nl = tex.find("\n", k)
                if nl == -1:
                    k = n
                    break
                k = nl + 1
                continue
            if ch == "{" and (k == 0 or tex[k - 1] != "\\"):
                depth += 1
            elif ch == "}" and (k == 0 or tex[k - 1] != "\\"):
                if depth == 0:
                    out.append(tex[start:k])
                    k += 1
                    break
                depth -= 1
            k += 1

        # If we didn't find a closing brace, fall back to keeping the original text.
        if k >= n and depth >= 0:
            out.append(tex[j:])
            break

        i = k

    return "".join(out)


def _rewrite_solution_commands(tex: str, show: bool) -> str:
    def _rewrite_one(source: str, command: str) -> str:
        needle = f"\\{command}"
        out: list[str] = []
        i = 0
        n = len(source)

        while i < n:
            j = source.find(needle, i)
            if j == -1:
                out.append(source[i:])
                break
            out.append(source[i:j])

            k = j + len(needle)
            while k < n and source[k].isspace():
                k += 1
            if k >= n or source[k] != "{":
                out.append(source[j:k])
                i = k
                continue

            depth = 0
            k += 1
            start = k
            while k < n:
                ch = source[k]
                if ch == "%" and (k == 0 or source[k - 1] != "\\"):
                    nl = source.find("\n", k)
                    if nl == -1:
                        k = n
                        break
                    k = nl + 1
                    continue
                if ch == "{" and (k == 0 or source[k - 1] != "\\"):
                    depth += 1
                elif ch == "}" and (k == 0 or source[k - 1] != "\\"):
                    if depth == 0:
                        content = source[start:k]
                        if show:
                            out.append(f"\\begin{{quote}}\\textbf{{Solution. }}{content}\\end{{quote}}")
                        k += 1
                        break
                    depth -= 1
                k += 1

            if k >= n and depth >= 0:
                out.append(source[j:])
                break

            i = k

        return "".join(out)

    tex = _rewrite_one(tex, "loesung")
    tex = _rewrite_one(tex, "solution")
    return tex


def _wrap_solution_environments(tex: str, show: bool) -> str:
    """
    Pandoc drops unknown environments (like `solution` / `loesung`) along with their
    contents. When solutions should be shown, map them to a simple block Pandoc
    understands; otherwise strip them entirely.
    """
    for env in ["solution", "loesung"]:
        if show:
            tex = re.sub(
                rf"\\begin\{{{env}\}}",
                r"\\begin{quote}\\textbf{Solution. }",
                tex,
                flags=re.IGNORECASE,
            )
            tex = re.sub(
                rf"\\end\{{{env}\}}",
                r"\\end{quote}",
                tex,
                flags=re.IGNORECASE,
            )
        else:
            tex = re.sub(
                rf"\\begin\{{{env}\}}[\s\S]*?\\end\{{{env}\}}",
                "",
                tex,
                flags=re.IGNORECASE,
            )
    return tex


def _preserve_item_labels(tex: str) -> str:
    """
    Pandoc ignores optional labels on \\item, so constructs like
      \\item[(a)] Foo
    lose their label in HTML. Expand the label into the item body instead.
    """
    def repl(match: re.Match) -> str:
        label = match.group(1).strip()
        if not label:
            return match.group(0)
        return f"\\item \\textbf{{{label}}} "

    return re.sub(r"\\item\\[(.*?)\\]", repl, tex)


def _strip_tex_comments(tex: str) -> str:
    out: list[str] = []
    for line in tex.splitlines(keepends=True):
        for idx, ch in enumerate(line):
            if ch == "%" and (idx == 0 or line[idx - 1] != "\\"):
                out.append(line[:idx] + ("\n" if line.endswith("\n") else ""))
                break
        else:
            out.append(line)
    return "".join(out)


def _tex_defines_command(tex: str, name: str) -> bool:
    pattern = re.compile(
        rf"\\(?:re)?newcommand\\*?\\s*(?:\\{{\\\\{name}\\}}|\\\\{name})"
        rf"|\\renewcommand\\*?\\s*(?:\\{{\\\\{name}\\}}|\\\\{name})"
        rf"|\\providecommand\\*?\\s*(?:\\{{\\\\{name}\\}}|\\\\{name})"
        rf"|\\def\\s*\\\\{name}\\b",
        re.IGNORECASE,
    )
    return bool(pattern.search(tex))


def _tex_uses_ethuebung(tex: str) -> bool:
    return bool(re.search(r"\\usepackage\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*ethuebung[^}]*\\}", tex, re.IGNORECASE))


def _tex_uses_ethuebung_solutions(tex: str) -> bool:
    for match in re.finditer(
        r"\\usepackage\\s*\\[([^\\]]*)\\]\\s*\\{[^}]*ethuebung[^}]*\\}",
        tex,
        re.IGNORECASE,
    ):
        opts = match.group(1)
        if re.search(r"(^|,)\\s*sol\\s*(,|$)", opts, re.IGNORECASE):
            return True
    return False


class Command(BaseCommand):
    help = "Render series TeX to HTML and cache it on the Series model. Uses pandoc+MathJax for a light, dependency-free baseline."

    def add_arguments(self, parser):
        parser.add_argument('--series-id', type=int, help='Render a single series by id')
        parser.add_argument('--force', action='store_true', help='Force re-render even if checksum matches')

    def handle(self, *args, **options):
        qs = Series.objects.all()
        if options['series_id']:
            qs = qs.filter(id=options['series_id'])
        count = qs.count()
        if count == 0:
            raise CommandError('No series matched the query.')

        successes = 0
        for series in qs:
            try:
                if self.render_series(series, force=options['force']):
                    successes += 1
            except Exception as exc:  # noqa: BLE001 - propagate informative error per series
                self.stderr.write(self.style.ERROR(f"Series {series.id}: {exc}"))
                series.render_status = Series.RenderStatus.FAILED
                series.render_log = str(exc)
                series.save(update_fields=['render_status', 'render_log'])

        self.stdout.write(self.style.SUCCESS(f"Rendered {successes}/{count} series"))

    def render_series(self, series: Series, force: bool = False) -> bool:
        if not series.tex_file:
            raise CommandError("Series has no tex_file set")

        fs_path = series.semester_group.fs_path
        if not fs_path:
            raise CommandError("Semester group fs_path is empty")

        tex_abs = Path(settings.LECTURE_MEDIA_ROOT) / fs_path / series.tex_file
        if not tex_abs.exists():
            raise CommandError(f"TeX file not found: {tex_abs}")

        # Inline \\input / \\include so wrapper files still produce content.
        full_tex = _inline_inputs(tex_abs, (Path(settings.LECTURE_MEDIA_ROOT) / fs_path))

        checksum = hashlib.sha256(full_tex.encode("utf-8", errors="ignore")).hexdigest()
        if not force and series.tex_checksum == checksum and series.render_status == Series.RenderStatus.OK:
            _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
            self.stdout.write(f"Series {series.id}: up-to-date, skipping")
            return False

        # Read TeX; if it is a fragment (no \\begin{document}), wrap in a minimal doc
        raw_tex = full_tex

        # Compatibility transforms for common Gold Mine LaTeX macros/environments.
        # Pandoc does not load .sty files, so these commands would otherwise be ignored and
        # exercise titles would disappear from the HTML.
        compat_prefix = r"""
% goldmine html render compat
\providecommand{\uebung}[1]{\subsection*{#1}}
\providecommand{\exercise}[1]{\subsection*{#1}}
\providecommand{\subuebung}[1]{\subsubsection*{#1}}
\providecommand{\subexercise}[1]{\subsubsection*{#1}}
"""
        raw_tex = compat_prefix + "\n" + raw_tex
        # Pandoc drops equation labels inside unsupported environments like subequations.
        # Flatten subequations so labels survive and MathJax can resolve \eqref.
        raw_tex = raw_tex.replace("\\begin{subequations}", "").replace("\\end{subequations}", "")
        raw_tex = _unwrap_single_brace_command(raw_tex, "hint")
        raw_tex = _move_trailing_math_labels_inside_env(raw_tex)
        raw_tex = raw_tex.replace("\\begin{exenumerate}", "\\begin{enumerate}")
        raw_tex = raw_tex.replace("\\end{exenumerate}", "\\end{enumerate}")
        scan_tex = _strip_tex_comments(raw_tex)
        uses_ethuebung = _tex_uses_ethuebung(scan_tex)
        show_solutions = _tex_uses_ethuebung_solutions(scan_tex)
        if not uses_ethuebung:
            if _tex_defines_command(scan_tex, "loesung") or _tex_defines_command(scan_tex, "solution"):
                show_solutions = True
        raw_tex = _rewrite_solution_commands(raw_tex, show_solutions)
        raw_tex = _wrap_solution_environments(raw_tex, show_solutions)
        raw_tex = _preserve_item_labels(raw_tex)
        raw_tex, marker_count = _inject_exercise_markers(raw_tex, series.exercises.count())
        if marker_count:
            self.stdout.write(f"Series {series.id}: inserted {marker_count} exercise markers")
        needs_wrap = "\\begin{document}" not in raw_tex
        if needs_wrap:
            preamble = r"""\documentclass{article}
\usepackage{amsmath,amssymb}
\newcommand{\chapterstopics}[2]{} % stub for StatPhys files
\begin{document}
"""
            raw_tex = preamble + raw_tex + "\n\\end{document}\n"

        # Use pandoc to HTML with MathJax (lightweight dependency footprint)
        cmd = [
            'pandoc',
            '-f', 'latex',
            '-t', 'html',
            '--mathjax',
        ]

        result = subprocess.run(cmd, input=raw_tex, capture_output=True, text=True)
        if result.returncode != 0:
            # Fallback: store escaped TeX so the UI can show something instead of nothing
            fallback_tex = _strip_marker_tokens(raw_tex)
            escaped = (
                fallback_tex.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            series.html_content = f"<pre>{escaped}</pre>"
            # Mark as failed so the frontend can prefer a PDF-based preview.
            series.render_status = Series.RenderStatus.FAILED
            series.render_log = f"Pandoc failed, showing raw TeX fallback: {result.stderr.strip()[:2000]}"
            series.html_rendered_at = timezone.now()
            series.tex_checksum = checksum
            series.save(update_fields=[
                'html_content', 'html_rendered_at', 'render_status', 'render_log', 'tex_checksum'
            ])
            _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
            self.stderr.write(self.style.WARNING(f"Series {series.id}: {series.render_log}"))  # log but continue
            return True

        html_content = _restore_eqrefs_to_mathjax(result.stdout)
        html_content = _normalize_pandoc_math_envs_for_mathjax(html_content)
        html_content = _normalize_math_macros_for_mathjax(html_content)
        html_content = _replace_markers_with_comments(html_content)
        series.html_content = html_content
        series.html_rendered_at = timezone.now()
        series.render_status = Series.RenderStatus.OK
        series.render_log = result.stderr[-1000:]
        series.tex_checksum = checksum
        series.save(update_fields=[
            'html_content', 'html_rendered_at', 'render_status', 'render_log', 'tex_checksum'
        ])
        _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS(f"Series {series.id}: rendered"))
        return True
