from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection, transaction

from core.models import Exercise, Lecture, SemesterGroup, Series
from core.uploads_api import _detect_series


def _tables_ready() -> bool:
    required = {"core_lecture", "core_semestergroup", "core_series", "core_exercise"}
    existing = set(connection.introspection.table_names())
    return required.issubset(existing)


def _example_root() -> Path:
    return Path(settings.BASE_DIR) / "examples" / "demo_upload"


def _parse_series_number(name: str) -> int | None:
    match = re.search(r"(?:serie|series|sheet|uebung|ex)\D*?(\d+)", name, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d+)", name)
    if match:
        return int(match.group(1))
    return None


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _write_minimal_pdf(path: Path, title: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [title, body]
    content_lines = []
    y = 720
    for line in lines:
        content_lines.append(
            f"BT /F1 14 Tf 72 {y} Td ({_pdf_escape(line)}) Tj ET"
        )
        y -= 24
    content = "\n".join(content_lines) + "\n"
    content_bytes = content.encode("latin-1")

    objects: list[bytes] = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    objects.append(
        b"3 0 obj\n"
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        b"endobj\n"
    )
    objects.append(
        b"4 0 obj\n"
        + f"<< /Length {len(content_bytes)} >>\n".encode("ascii")
        + b"stream\n"
        + content_bytes
        + b"endstream\nendobj\n"
    )
    objects.append(
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    pos = len(header)
    for obj in objects:
        offsets.append(pos)
        pos += len(obj)

    xref_lines = ["xref", f"0 {len(objects) + 1}", "0000000000 65535 f "]
    for off in offsets[1:]:
        xref_lines.append(f"{off:010d} 00000 n ")
    xref = ("\n".join(xref_lines) + "\n").encode("ascii")

    trailer = (
        "trailer\n"
        f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        "startxref\n"
        f"{pos}\n"
        "%%EOF\n"
    ).encode("ascii")

    with open(path, "wb") as fh:
        fh.write(header)
        for obj in objects:
            fh.write(obj)
        fh.write(xref)
        fh.write(trailer)


def _ensure_demo_pdfs(root: Path) -> None:
    for idx, series_dir in enumerate(sorted([p for p in root.iterdir() if p.is_dir()]), 1):
        tex_files = sorted(series_dir.glob("*.tex"))
        if not tex_files:
            continue
        number = _parse_series_number(series_dir.name) or idx
        sheet_pdf = series_dir / f"sheet_{number:02d}.pdf"
        solution_pdf = series_dir / f"solution_{number:02d}.pdf"
        if not sheet_pdf.exists():
            _write_minimal_pdf(
                sheet_pdf,
                f"Goldmine V2 Demo - Series {number}",
                "This is a placeholder PDF generated for dev seeding.",
            )
        if not solution_pdf.exists():
            _write_minimal_pdf(
                solution_pdf,
                f"Goldmine V2 Demo - Series {number} Solutions",
                "This is a placeholder solution PDF generated for dev seeding.",
            )


def _read_tex(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def _extract_series_title(tex: str) -> str:
    match = re.search(r"\\section\*?\s*\{([^}]*)\}", tex)
    if match:
        return match.group(1).strip()
    return ""


def _extract_exercise_titles(tex: str) -> list[str]:
    titles = [m.group(1).strip() for m in re.finditer(r"\\exercise\s*\{([^}]*)\}", tex)]
    if titles:
        return titles
    titles = [m.group(1).strip() for m in re.finditer(r"\\subsection\*?\s*\{([^}]*)\}", tex)]
    if titles:
        return titles

    count = len(re.findall(r"\\begin\{exercise\}", tex, re.IGNORECASE))
    if count:
        return [f"Exercise {idx}" for idx in range(1, count + 1)]

    count = len(re.findall(r"\\begin\{problem\}", tex, re.IGNORECASE))
    if count:
        return [f"Exercise {idx}" for idx in range(1, count + 1)]

    return []


class Command(BaseCommand):
    help = "Seed example course content for local development using demo TeX uploads."

    def handle(self, *args, **options) -> None:
        if not _tables_ready():
            self.stdout.write("Seed skipped: database tables not ready (run migrations first).")
            return

        example_root = _example_root()
        if not example_root.exists():
            self.stdout.write("Seed skipped: demo upload files are missing.")
            return

        lecture_defaults = {
            "long_name": "Example Course: Mathematical Methods",
        }
        semester_defaults = {
            "professors": "Prof. Ada Lovelace",
            "assistants": "TA Example",
            "fs_path": "",
        }

        with tempfile.TemporaryDirectory(prefix="goldmine-seed-") as tmpdir:
            tmp_root = Path(tmpdir) / "demo_upload"
            shutil.copytree(example_root, tmp_root)
            _ensure_demo_pdfs(tmp_root)

            report = _detect_series(tmp_root)
            if not report.series:
                self.stdout.write("Seed skipped: no series detected in demo upload folder.")
                return

            with transaction.atomic():
                lecture, created = Lecture.all_objects.get_or_create(
                    name="DEMO",
                    defaults=lecture_defaults,
                )
                if lecture.is_deleted:
                    lecture.restore()
                if created:
                    self.stdout.write("Created demo lecture.")

                fs_path = f"{lecture.name}/2025HS"
                semester_group, created = SemesterGroup.all_objects.get_or_create(
                    lecture=lecture,
                    year=2025,
                    semester="HS",
                    defaults={**semester_defaults, "fs_path": fs_path},
                )
                if semester_group.is_deleted:
                    semester_group.restore()
                if created:
                    self.stdout.write("Created demo semester group.")

                if semester_group.fs_path != fs_path:
                    semester_group.fs_path = fs_path
                semester_group.professors = semester_defaults["professors"]
                semester_group.assistants = semester_defaults["assistants"]
                semester_group.save(update_fields=["fs_path", "professors", "assistants"])

                dest_root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path
                dest_root.mkdir(parents=True, exist_ok=True)
                shutil.copytree(tmp_root, dest_root, dirs_exist_ok=True)

                created_series: list[Series] = []
                for entry in report.series:
                    tex_path = dest_root / entry.tex_file if entry.tex_file else None
                    tex_source = _read_tex(tex_path) if tex_path and tex_path.exists() else ""
                    title = _extract_series_title(tex_source)

                    series, series_created = Series.all_objects.get_or_create(
                        semester_group=semester_group,
                        number=entry.number,
                        defaults={
                            "title": title or f"Series {entry.number}",
                            "tex_file": entry.tex_file or "",
                            "pdf_file": entry.pdf_file or "",
                            "solution_file": entry.solution_file or "",
                        },
                    )
                    if series.is_deleted:
                        series.restore()
                    if series_created:
                        self.stdout.write(f"Created demo series {entry.number}.")

                    series.title = title or series.title or f"Series {entry.number}"
                    series.tex_file = entry.tex_file or ""
                    series.pdf_file = entry.pdf_file or ""
                    series.solution_file = entry.solution_file or ""
                    series.save(update_fields=["title", "tex_file", "pdf_file", "solution_file"])
                    created_series.append(series)

                    exercise_titles = _extract_exercise_titles(tex_source)
                    if not exercise_titles:
                        exercise_titles = [f"Exercise {idx}" for idx in range(1, 3)]

                    for idx, ex_title in enumerate(exercise_titles, 1):
                        ex, ex_created = Exercise.all_objects.get_or_create(
                            series=series,
                            number=idx,
                            defaults={
                                "title": ex_title,
                                "text_content": ex_title,
                                "search_text": ex_title,
                            },
                        )
                        if ex.is_deleted:
                            ex.restore()
                        if ex_created:
                            self.stdout.write(f"Created exercise {entry.number}.{idx}.")
                        if not ex.title:
                            ex.title = ex_title
                            ex.save(update_fields=["title"])
                        if not ex.search_text.strip():
                            ex.search_text = ex_title
                            ex.save(update_fields=["search_text"])

            render = os.getenv("SEED_DEV_RENDER", "1").lower() not in {"0", "false", "no"}
            if render and created_series:
                try:
                    call_command(
                        "render_series_html",
                        series_id=[s.id for s in created_series],
                        force=True,
                        stdout=self.stdout,
                        stderr=self.stderr,
                    )
                except Exception as exc:
                    self.stdout.write(f"Render skipped: {exc}")

        self.stdout.write(self.style.SUCCESS("Dev seed data is ready."))
