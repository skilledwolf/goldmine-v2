import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Series, Exercise
from core.search_utils import extract_exercise_search_texts

import re


MARKER_TOKEN = "GMEXMARKER-"
MARKER_RE = re.compile(rf"{MARKER_TOKEN}(\d+)")

# Bump this when changing the render backend/options so cached HTML is regenerated.
RENDER_PIPELINE_ID = "latexml-html5-fragment-v6"


def _replace_markers_with_comments(html: str) -> str:
    # Remove full marker-only paragraphs to avoid extra vertical space in previews.
    html = re.sub(
        rf"<p\b[^>]*>\s*{MARKER_TOKEN}(\d+)\s*</p>",
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
    pre = line[:match.start()]
    if "\\newcommand" in pre or "\\renewcommand" in pre or "\\providecommand" in pre:
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

    prefix = ""
    suffix = ""
    body = raw_tex
    begin_doc = raw_tex.find("\\begin{document}")
    if begin_doc != -1:
        begin_end = begin_doc + len("\\begin{document}")
        end_doc = raw_tex.find("\\end{document}", begin_end)
        if end_doc != -1:
            prefix = raw_tex[:begin_end]
            body = raw_tex[begin_end:end_doc]
            suffix = raw_tex[end_doc:]

    patterns = [
        re.compile(r"\\begin\{problem\}", re.IGNORECASE),
        re.compile(r"\\begin\{exercise\}", re.IGNORECASE),
        re.compile(r"\\exercise\s*\{", re.IGNORECASE),
        re.compile(r"\\uebung\s*\{", re.IGNORECASE),
        re.compile(r"\\subsection\*?\s*\{", re.IGNORECASE),
        re.compile(r"\{\\utit\b", re.IGNORECASE),
        re.compile(r"\{\\uutit\b", re.IGNORECASE),
    ]

    for pattern in patterns:
        match_count = _count_pattern_matches(body, pattern)
        if match_count == exercise_count:
            injected_body, injected_count = _inject_markers_for_pattern(body, pattern, exercise_count)
            return f"{prefix}{injected_body}{suffix}", injected_count

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
        # Drop TeX's file terminator so downstream converters don't stop mid-document when we inline.
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


def _resolve_tex_package_path(ref: str, base_dir: Path, semester_root: Path) -> Path | None:
    cleaned = (ref or "").strip().strip("{}")
    if not cleaned:
        return None

    # Handle comma-separated lists defensively (though our use cases are usually single).
    first = cleaned.split(",")[0].strip()
    if not first:
        return None

    candidates: list[Path] = []
    raw = base_dir / first
    candidates.append(raw)
    candidates.append(semester_root / first)

    for cand in list(candidates):
        if cand.suffix:
            continue
        candidates.append(cand.with_suffix(".sty"))

    for cand in candidates:
        try:
            resolved = cand.resolve()
        except OSError:
            continue
        if resolved.is_file():
            return resolved
    return None


def _render_tex_to_html(
    raw_tex: str,
    base_dir: Path,
    semester_root: Path,
    asset_out_dir: Path | None = None,
) -> tuple[int, str, str]:
    """
    Convert TeX to an HTML5 fragment using LaTeXML.

    Returns (returncode, html, log).
    """
    with tempfile.TemporaryDirectory(prefix="goldmine-latexml-") as tmpdir:
        tmp = Path(tmpdir)
        input_path = tmp / "input.tex"
        output_path = tmp / "output.html"
        log_path = tmp / "latexmlc.log"
        babel_stub_path = tmp / "babel.sty"
        fixmath_stub_path = tmp / "fixmath.sty"
        input_path.write_text(raw_tex, encoding="utf-8", errors="ignore")

        # LaTeXML's interaction with the TeXlive babel package can be brittle and has
        # caused widespread failures across the corpus. For HTML previews we don't need
        # localized strings/hyphenation, so we shadow `babel.sty` with a minimal stub.
        babel_stub_path.write_text(
            r"""
% Minimal babel stub for LaTeXML HTML preview.
\ProvidesPackage{babel}[9999/01/01 babel stub]
\newcommand{\selectlanguage}[1]{}
\newcommand{\foreignlanguage}[2]{#2}
\def\languagename{english}
\providecommand{\bibname}{Bibliography}
\providecommand{\prefacename}{Preface}
\providecommand{\enclname}{Encl.}
\providecommand{\ccname}{cc}
\providecommand{\headtoname}{To}
\endinput
""".lstrip(),
            encoding="utf-8",
        )

        # Several legacy sources depend on fixmath, which may not be present in minimal
        # TeXlive installs. For previews we only need it to exist, not to perfectly match
        # TeX output, so we provide a tiny stub.
        fixmath_stub_path.write_text(
            r"""
% Minimal fixmath stub for LaTeXML HTML preview.
\ProvidesPackage{fixmath}[9999/01/01 fixmath stub]
\providecommand{\mathbold}[1]{\mathbf{#1}}
\endinput
""".lstrip(),
            encoding="utf-8",
        )

        cmd = [
            "latexmlc",
            "--preload=LaTeX.pool",
            "--format=html5",
            "--whatsout=fragment",
            "--includestyles",
            "--base",
            str(base_dir),
            "--log",
            str(log_path),
            "--destination",
            str(output_path),
            "--path",
            str(tmp),
            "--path",
            str(base_dir),
            "--path",
            str(semester_root),
            str(input_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        log_parts = []
        if log_path.exists():
            try:
                log_parts.append(log_path.read_text(encoding="utf-8"))
            except UnicodeDecodeError:
                log_parts.append(log_path.read_text(encoding="latin-1"))
        if result.stderr:
            log_parts.append(result.stderr)
        if result.stdout:
            log_parts.append(result.stdout)
        log = "\n".join(part.strip() for part in log_parts if part and part.strip()).strip()

        html = ""
        if output_path.exists():
            try:
                html = output_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                html = output_path.read_text(encoding="latin-1")

        if asset_out_dir and result.returncode == 0 and html.strip():
            asset_out_dir.mkdir(parents=True, exist_ok=True)
            for child in list(asset_out_dir.rglob("*")):
                if child.is_file():
                    try:
                        child.unlink()
                    except OSError:
                        pass

            keep_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"}
            for src in tmp.rglob("*"):
                if not src.is_file():
                    continue
                if src.suffix.lower() not in keep_exts:
                    continue
                try:
                    rel = src.relative_to(tmp)
                except ValueError:
                    continue
                dest = asset_out_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(src, dest)
                except OSError:
                    continue

        return result.returncode, html, log


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
    equation number, but some HTML renderers treat this as an out-of-math label, which can
    break \\ref/\\eqref in previews.
    """
    envs = r"(?:equation|align|gather|multline|alignat|eqnarray|flalign)"
    pattern = re.compile(
        rf"(\\end\{{(?P<env>{envs})\*?\}})\s*(?P<label>\\label\{{[^}}]+\}})(?P<comment>%[^\n]*)?",
        re.MULTILINE,
    )
    return pattern.sub(lambda m: f"{m.group('label')}{m.group('comment') or ''}\n{m.group(1)}", tex)

def _unwrap_single_brace_command(tex: str, command: str) -> str:
    """
    Some renderers treat unknown commands as fatal errors, or drop their contents.
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


def _rewrite_two_arg_command(tex: str, command: str, template: str) -> str:
    needle = f"\\{command}"
    out: list[str] = []
    i = 0
    n = len(tex)

    def _consume_braced(start_idx: int) -> tuple[str | None, int]:
        if start_idx >= n or tex[start_idx] != "{":
            return None, start_idx
        depth = 0
        k = start_idx + 1
        content_start = k
        while k < n:
            ch = tex[k]
            if ch == "%" and (k == 0 or tex[k - 1] != "\\"):
                nl = tex.find("\n", k)
                if nl == -1:
                    return None, n
                k = nl + 1
                continue
            if ch == "{" and (k == 0 or tex[k - 1] != "\\"):
                depth += 1
            elif ch == "}" and (k == 0 or tex[k - 1] != "\\"):
                if depth == 0:
                    return tex[content_start:k], k + 1
                depth -= 1
            k += 1
        return None, n

    while i < n:
        j = tex.find(needle, i)
        if j == -1:
            out.append(tex[i:])
            break
        out.append(tex[i:j])

        k = j + len(needle)
        while k < n and tex[k].isspace():
            k += 1
        first, k_after = _consume_braced(k)
        if first is None:
            out.append(tex[j:k_after])
            i = k_after
            continue

        k = k_after
        while k < n and tex[k].isspace():
            k += 1
        second, k_after = _consume_braced(k)
        if second is None:
            out.append(tex[j:k_after])
            i = k_after
            continue

        out.append(template.format(arg1=first, arg2=second))
        i = k_after

    return "".join(out)


def _wrap_solution_environments(tex: str, show: bool) -> str:
    """
    Some sources use custom environments (like `solution` / `loesung`). When solutions
    should be shown, map them to a simple block the HTML renderer understands;
    otherwise strip them entirely.
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
    Some renderers ignore optional labels on \\item, so constructs like
      \\item[(a)] Foo
    lose their label in HTML. Expand the label into the item body instead.
    """
    def repl(match: re.Match) -> str:
        label = match.group(1).strip()
        if not label:
            return match.group(0)
        return f"\\item \\textbf{{{label}}} "

    return re.sub(r"\\item\\[(.*?)\\]", repl, tex)


def _rewrite_exenumerate(tex: str) -> str:
    """
    ethuebung's exenumerate is implemented via enumitem and uses label macros like \\alph*
    which LaTeXML doesn't expand reliably. For HTML previews, map it to a plain
    enumerate with simple label definitions.
    """
    begin = re.compile(r"\\begin\{exenumerate\}(?:\[[^\]]*\])?", re.IGNORECASE)
    end = re.compile(r"\\end\{exenumerate\}", re.IGNORECASE)

    begin_repl = r"""\begin{enumerate}
\renewcommand{\labelenumi}{(\alph{enumi})}
\renewcommand{\labelenumii}{(\roman{enumii})}
\renewcommand{\labelenumiii}{(\arabic{enumiii})}
"""

    tex = begin.sub(lambda _m: begin_repl, tex)
    tex = end.sub(lambda _m: r"\end{enumerate}", tex)
    # ethuebung uses `\item*` for optional/bonus items; translate to an explicit label.
    tex = re.sub(r"\\item\*", lambda _m: r"\item[(*)]", tex)
    return tex


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
        rf"\\(?:re)?newcommand\*?\s*(?:\{{\\{name}\}}|\\{name})"
        rf"|\\renewcommand\*?\s*(?:\{{\\{name}\}}|\\{name})"
        rf"|\\providecommand\*?\s*(?:\{{\\{name}\}}|\\{name})"
        rf"|\\def\s*\\{name}\b",
        re.IGNORECASE,
    )
    return bool(pattern.search(tex))


def _tex_uses_ethuebung(tex: str) -> bool:
    return bool(re.search(r"\\usepackage\s*(?:\[(.*?)\])?\s*\{[^}]*ethuebung[^}]*\}", tex, re.IGNORECASE))


def _tex_uses_ethuebung_solutions(tex: str) -> bool:
    if re.search(r"\\UebungMakeSolutionsSheet\b", tex):
        return True
    for match in re.finditer(
        r"\\usepackage\s*\[(.*?)\]\s*\{[^}]*ethuebung[^}]*\}",
        tex,
        re.IGNORECASE,
    ):
        opts = match.group(1)
        if re.search(r"(^|,)\s*sol\s*(,|$)", opts, re.IGNORECASE):
            return True
    return False


def _tex_has_solution_env(tex: str) -> bool:
    return bool(re.search(r"\\begin\{(?:solution|loesung)\}", tex, re.IGNORECASE))


class Command(BaseCommand):
    help = "Render series TeX to HTML and cache it on the Series model. Uses LaTeXML for richer LaTeX support."

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

        semester_root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path

        # Inline \\input / \\include so wrapper files still produce content.
        full_tex = _inline_inputs(tex_abs, semester_root)

        checksum = hashlib.sha256(
            (RENDER_PIPELINE_ID + "\n" + full_tex).encode("utf-8", errors="ignore")
        ).hexdigest()
        if not force and series.tex_checksum == checksum and series.render_status == Series.RenderStatus.OK:
            _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
            self.stdout.write(f"Series {series.id}: up-to-date, skipping")
            return False

        # Read TeX; if it is a fragment (no \\begin{document}), wrap in a minimal doc
        raw_tex = full_tex

        # LaTeXML's babel bindings do not support all legacy language options used by
        # ethuebung sheets (e.g. "german"), and this can cascade into fatal parse errors.
        # For HTML previews we don't need localized header strings, so strip the directive.
        raw_tex = re.sub(r"^\s*\\UebungLanguage\{[^}]*\}\s*$", "", raw_tex, flags=re.MULTILINE)

        # LaTeXML currently struggles with some LaTeX3-based packages (notably siunitx),
        # which can cause hard failures deep inside expl3. For previews, strip it and
        # rely on lightweight stubs (injected below) when its commands appear.
        raw_tex = re.sub(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{siunitx\}\s*(?:%[^\n]*)?$",
            "",
            raw_tex,
            flags=re.MULTILINE,
        )

        # LaTeXML's binding for SIunits delegates to siunitx (expl3-based), which can
        # lead to the same fatal expl3 parsing issues. For previews, strip SIunits too.
        raw_tex = re.sub(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{SIunits\}\s*(?:%[^\n]*)?$",
            "",
            raw_tex,
            flags=re.MULTILINE | re.IGNORECASE,
        )

        # mhchem (especially newer releases) may rely on LaTeX3; moreover, it is not
        # guaranteed to exist in minimal TeXlive installs. For previews, strip it and
        # provide a lightweight `\\ce` stub.
        raw_tex = re.sub(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{mhchem\}\s*(?:%[^\n]*)?$",
            "",
            raw_tex,
            flags=re.MULTILINE | re.IGNORECASE,
        )

        # The tensor package is not always available in minimal installs and its macros
        # can trigger LaTeXML parse errors when undefined. Strip it and rely on stubs.
        raw_tex = re.sub(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{tensor\}\s*(?:%[^\n]*)?$",
            "",
            raw_tex,
            flags=re.MULTILINE | re.IGNORECASE,
        )

        # Some older archives reference a local checkout of ethuebung (e.g. ../ethuebung)
        # but don't ship the style file. If it's missing, drop the package and inject
        # lightweight stubs so the preview still renders.
        missing_ethuebung = False
        for match in re.finditer(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{([^}]*ethuebung[^}]*)\}\s*(?:%[^\n]*)?$",
            raw_tex,
            flags=re.MULTILINE | re.IGNORECASE,
        ):
            pkg_ref = match.group(1)
            if _resolve_tex_package_path(pkg_ref, tex_abs.parent, semester_root) is None:
                missing_ethuebung = True
                break

        if missing_ethuebung:
            raw_tex = re.sub(
                r"^\s*\\usepackage(?:\[[^\]]*\])?\{[^}]*ethuebung[^}]*\}\s*(?:%[^\n]*)?$",
                "",
                raw_tex,
                flags=re.MULTILINE | re.IGNORECASE,
            )
            ethuebung_compat = r"""
% goldmine html render compat: missing ethuebung
\usepackage{amsmath,amssymb,graphicx}
\usepackage{enumitem}
\providecommand{\url}[1]{#1}
\providecommand{\href}[2]{#2}
\providecommand{\UebungLanguage}[1]{}
\providecommand{\UebungLecture}[1]{}
\providecommand{\UebungProf}[1]{}
\providecommand{\UebungLecturer}[1]{}
\providecommand{\UebungSemester}[1]{}
\providecommand{\UebungsblattTitleSeries}[1]{}
\providecommand{\UebungsblattTitleSolutions}[1]{}
\providecommand{\UebungsblattNumber}[1]{}
\providecommand{\UebungStyle}[1]{}
\providecommand{\UebungLabel}[1]{}
\providecommand{\MakeUebungHeader}{}
\newif\ifmusterloesung
\newif\ifuebungsblatt
\musterloesungtrue
""".strip()
            raw_tex = re.sub(
                r"(\\documentclass(?:\[[^\]]*\])?\{[^}]+\})",
                lambda m: f"{m.group(1)}\n{ethuebung_compat}\n",
                raw_tex,
                count=1,
            )

        # mpostinl embeds MetaPost source via the `mpostcmd` environment, which LaTeXML
        # tends to treat as verbatim and then fails validation when TeX markup appears
        # later in the file. For previews, drop these blocks and the package entirely.
        raw_tex = re.sub(
            r"^\s*\\usepackage(?:\[[^\]]*\])?\{mpostinl\}\s*$",
            "",
            raw_tex,
            flags=re.MULTILINE | re.IGNORECASE,
        )
        raw_tex = re.sub(
            r"\\begin\{mpostcmd\}[\s\S]*?\\end\{mpostcmd\}",
            "",
            raw_tex,
            flags=re.IGNORECASE,
        )

        # Some series use a custom `problems` document class that is not shipped with the
        # archive. For HTML previews, fall back to `article` and stub the key environments.
        if re.search(r"\\documentclass(?:\[[^\]]*\])?\{problems\}", raw_tex):
            raw_tex = re.sub(
                r"^\s*\\PassOptionsToClass\{[^}]*\}\{problems\}\s*$",
                "",
                raw_tex,
                flags=re.MULTILINE,
            )
            raw_tex = re.sub(
                r"\\documentclass(?:\[[^\]]*\])?\{problems\}",
                r"\\documentclass{article}",
                raw_tex,
                count=1,
            )
            problems_compat = r"""
% goldmine html render compat: problems.cls
\usepackage{amsmath,amssymb}
\newcounter{sheet}
\newcommand{\turnover}{\par\medskip}
\newenvironment{problem}[1]{\section*{#1}}{\par}
\newenvironment{subproblem}[1][]{\par\medskip\noindent\textbf{#1}\par}{\par}
""".strip()
            raw_tex = re.sub(
                r"(\\documentclass(?:\[[^\]]*\])?\{article\})",
                lambda m: f"{m.group(1)}\n{problems_compat}\n",
                raw_tex,
                count=1,
            )

        # KOMA-Script classes (scrartcl, ...) now rely on LaTeX3/expl3 internals that
        # LaTeXML cannot reliably digest. For previews, fall back to the base classes.
        def _swap_documentclass(tex: str, old: str, new: str) -> str:
            pattern = re.compile(
                r"\\documentclass(?P<opts>\[.*?\])?\{" + re.escape(old) + r"\}",
                re.IGNORECASE,
            )
            m = pattern.search(tex)
            if not m:
                return tex
            opts = m.group("opts") or ""
            replacement = f"\\documentclass{opts}{{{new}}}"
            return tex[: m.start()] + replacement + tex[m.end() :]

        raw_tex = _swap_documentclass(raw_tex, "scrartcl", "article")
        raw_tex = _swap_documentclass(raw_tex, "scrreprt", "report")
        raw_tex = _swap_documentclass(raw_tex, "scrbook", "book")

        raw_tex, marker_count = _inject_exercise_markers(raw_tex, series.exercises.count())
        if marker_count:
            self.stdout.write(f"Series {series.id}: inserted {marker_count} exercise markers")

        # Compatibility transforms for common Gold Mine LaTeX macros/environments.
        raw_tex = _move_trailing_math_labels_inside_env(raw_tex)
        scan_tex = _strip_tex_comments(raw_tex)
        uses_ethuebung = _tex_uses_ethuebung(scan_tex)
        show_solutions = _tex_uses_ethuebung_solutions(scan_tex)

        compat_prefix = r"""
% goldmine html render compat
\providecommand{\hint}[1]{\textit{Hint: #1}}
\providecommand{\hints}[1]{\textit{Hints: #1}}
\providecommand{\hinweis}[1]{\textit{Hinweis: #1}}
\providecommand{\hinweise}[1]{\textit{Hinweise: #1}}
\providecommand{\SI}[3][]{#2\,#3}
\providecommand{\si}[2][]{#2}
\providecommand{\num}[2][]{#2}
\providecommand{\qty}[3][]{#2\,#3}
\providecommand{\sisetup}[1]{}
\providecommand{\DeclareSIUnit}[2]{}
\providecommand{\unit}[1]{\ensuremath{#1}}
\providecommand{\ce}[1]{\ensuremath{#1}}
\providecommand{\ch}[1]{\ensuremath{#1}}
\providecommand{\indices}[1]{}
\providecommand{\tensor}[2]{#1}
\providecommand{\uebung}[1]{\subsection*{#1}}
\providecommand{\exercise}[1]{\subsection*{#1}}
\providecommand{\subuebung}[1]{\subsubsection*{#1}}
\providecommand{\subexercise}[1]{\subsubsection*{#1}}
""".strip()
        if _tex_has_solution_env(scan_tex):
            show_solutions = True
        elif not uses_ethuebung:
            if _tex_defines_command(scan_tex, "loesung") or _tex_defines_command(scan_tex, "solution"):
                show_solutions = True
        raw_tex = _rewrite_solution_commands(raw_tex, show_solutions)
        raw_tex = _wrap_solution_environments(raw_tex, show_solutions)
        raw_tex = _rewrite_two_arg_command(raw_tex, "uebung", r"\subsection*{{{arg1}. {arg2}}}")
        raw_tex = _rewrite_exenumerate(raw_tex)
        needs_wrap = "\\begin{document}" not in raw_tex
        if needs_wrap:
            preamble = r"""\documentclass{article}
\usepackage{amsmath,amssymb}
\newcommand{\chapterstopics}[2]{} % stub for StatPhys files
\begin{document}
"""
            raw_tex = preamble + raw_tex + "\n\\end{document}\n"

        begin_doc = raw_tex.find("\\begin{document}")
        if begin_doc != -1:
            raw_tex = raw_tex[:begin_doc] + compat_prefix + "\n" + raw_tex[begin_doc:]
        else:
            raw_tex = compat_prefix + "\n" + raw_tex

        asset_out_dir = Path(settings.MEDIA_ROOT) / "latexml-assets" / str(series.id)

        # Use LaTeXML to produce an HTML5 fragment (better LaTeX package/macro support).
        rc, html, log = _render_tex_to_html(
            raw_tex,
            base_dir=tex_abs.parent,
            semester_root=semester_root,
            asset_out_dir=asset_out_dir,
        )
        if rc != 0 or not (html or "").strip():
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
            snippet = (log or "").strip()
            if snippet:
                snippet = snippet[-2000:]
            series.render_log = f"LaTeXML failed, showing raw TeX fallback: {snippet}"
            series.html_rendered_at = timezone.now()
            series.tex_checksum = checksum
            series.save(update_fields=[
                'html_content', 'html_rendered_at', 'render_status', 'render_log', 'tex_checksum'
            ])
            _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
            self.stderr.write(self.style.WARNING(f"Series {series.id}: {series.render_log}"))  # log but continue
            return True

        html_content = _replace_markers_with_comments(html)
        series.html_content = html_content
        series.html_rendered_at = timezone.now()
        series.render_status = Series.RenderStatus.OK
        series.render_log = (log or "")[-1000:]
        series.tex_checksum = checksum
        series.save(update_fields=[
            'html_content', 'html_rendered_at', 'render_status', 'render_log', 'tex_checksum'
        ])
        _update_exercise_search_texts(series, series.html_content, stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS(f"Series {series.id}: rendered"))
        return True
