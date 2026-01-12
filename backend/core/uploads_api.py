import os
import re
import shutil
import zipfile
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.errors import HttpError

from .models import UploadJob, Lecture, SemesterGroup, Series


uploads_router = Router()


def require_staff(request):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.is_staff:
        raise HttpError(403, "Staff only")


class UploadReportSeriesSchema(Schema):
    number: int
    title: str = ""
    dir: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""
    issues: list[str] = []


class UploadReportSchema(Schema):
    root: str
    series: list[UploadReportSeriesSchema]
    unassigned: list[str] = []
    warnings: list[str] = []


class UploadCreateResponseSchema(Schema):
    id: int
    status: str
    fs_path: str
    report: UploadReportSchema


class UploadCommitSeriesSchema(Schema):
    number: int
    title: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""


class UploadCommitSchema(Schema):
    overwrite: bool = False
    series: list[UploadCommitSeriesSchema] = []


def _uploads_root() -> Path:
    root = Path(settings.MEDIA_ROOT) / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_extract_zip(zip_path: Path, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            name = info.filename
            if not name or name.endswith("/"):
                continue
            parts = Path(name).parts
            if name.startswith("/") or ".." in parts or name.startswith("\\"):
                raise HttpError(400, f"Invalid path in zip: {name}")
            if parts[0].startswith("__MACOSX"):
                continue
            target = dest_dir / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)


def _detect_root(extract_dir: Path) -> Path:
    entries = [p for p in extract_dir.iterdir() if p.name not in {"__MACOSX"}]
    dirs = [p for p in entries if p.is_dir()]
    if len(dirs) == 1 and not any(p.is_file() for p in entries):
        return dirs[0]
    return extract_dir


def _parse_series_number(name: str) -> Optional[int]:
    m = re.search(r"(?:serie|series|sheet|uebung|ex)\D*?(\d+)", name, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)", name)
    if m:
        return int(m.group(1))
    return None


def _is_solution_name(name: str) -> bool:
    return bool(re.search(r"(sol|solution|loes|loesung)", name, re.IGNORECASE))


def _pick_best(paths: list[Path], number: Optional[int], kind: str) -> Optional[Path]:
    if not paths:
        return None
    if len(paths) == 1:
        return paths[0]

    def score(p: Path) -> int:
        name = p.name.lower()
        s = 0
        if kind == "solution":
            if _is_solution_name(name):
                s += 4
        else:
            if _is_solution_name(name):
                s -= 4
        if re.search(r"(ex|sheet|serie|uebung)", name):
            s += 2
        if number is not None and str(number) in name:
            s += 2
        return s

    return sorted(paths, key=score, reverse=True)[0]


def _detect_series(root_dir: Path) -> UploadReportSchema:
    series_entries: list[UploadReportSeriesSchema] = []
    unassigned: list[str] = []
    warnings: list[str] = []

    series_dirs: list[Path] = []
    for entry in root_dir.iterdir():
        if not entry.is_dir():
            continue
        if entry.name.startswith("__MACOSX"):
            continue
        has_candidate = any(
            f.suffix.lower() in {".pdf", ".tex"} for f in entry.rglob("*") if f.is_file()
        )
        if not has_candidate:
            continue
        if _parse_series_number(entry.name) is None:
            continue
        series_dirs.append(entry)

    if not series_dirs:
        # fallback: single series from root files
        pdfs = [p for p in root_dir.rglob("*.pdf") if p.is_file()]
        texs = [p for p in root_dir.rglob("*.tex") if p.is_file()]
        if not pdfs and not texs:
            warnings.append("no_series_detected")
            return UploadReportSchema(root=root_dir.name, series=[], unassigned=[], warnings=warnings)
        main_pdf = _pick_best(pdfs, None, "pdf")
        sol_pdf = _pick_best([p for p in pdfs if _is_solution_name(p.name)], None, "solution")
        main_tex = _pick_best([p for p in texs if not _is_solution_name(p.name)], None, "tex")
        issues: list[str] = []
        if not main_pdf:
            issues.append("missing_pdf")
        series_entries.append(
            UploadReportSeriesSchema(
                number=1,
                title="",
                dir=".",
                tex_file=main_tex.relative_to(root_dir).as_posix() if main_tex else "",
                pdf_file=main_pdf.relative_to(root_dir).as_posix() if main_pdf else "",
                solution_file=sol_pdf.relative_to(root_dir).as_posix() if sol_pdf else "",
                issues=issues,
            )
        )
        return UploadReportSchema(root=root_dir.name, series=series_entries, unassigned=unassigned, warnings=warnings)

    for sdir in sorted(series_dirs, key=lambda p: p.name.lower()):
        num = _parse_series_number(sdir.name) or 0
        pdfs = [p for p in sdir.rglob("*.pdf") if p.is_file()]
        texs = [p for p in sdir.rglob("*.tex") if p.is_file()]
        sol_pdfs = [p for p in pdfs if _is_solution_name(p.name)]
        main_pdfs = [p for p in pdfs if p not in sol_pdfs]
        main_texs = [p for p in texs if not _is_solution_name(p.name)]

        issues: list[str] = []
        if not main_pdfs:
            issues.append("missing_pdf")
        if len(main_pdfs) > 1:
            issues.append("multiple_pdfs")
        if len(main_texs) > 1:
            issues.append("multiple_tex")
        if len(sol_pdfs) > 1:
            issues.append("multiple_solution_pdfs")

        chosen_pdf = _pick_best(main_pdfs, num, "pdf")
        chosen_sol = _pick_best(sol_pdfs, num, "solution")
        chosen_tex = _pick_best(main_texs, num, "tex")

        series_entries.append(
            UploadReportSeriesSchema(
                number=num,
                title="",
                dir=sdir.relative_to(root_dir).as_posix(),
                tex_file=chosen_tex.relative_to(root_dir).as_posix() if chosen_tex else "",
                pdf_file=chosen_pdf.relative_to(root_dir).as_posix() if chosen_pdf else "",
                solution_file=chosen_sol.relative_to(root_dir).as_posix() if chosen_sol else "",
                issues=issues,
            )
        )

    assigned = set()
    for entry in series_entries:
        for path in [entry.tex_file, entry.pdf_file, entry.solution_file]:
            if path:
                assigned.add(path)

    for file in root_dir.rglob("*"):
        if not file.is_file():
            continue
        rel = file.relative_to(root_dir).as_posix()
        if rel not in assigned and file.suffix.lower() in {".pdf", ".tex"}:
            unassigned.append(rel)

    if unassigned:
        warnings.append("unassigned_files")

    series_entries = sorted(series_entries, key=lambda s: s.number)
    return UploadReportSchema(root=root_dir.name, series=series_entries, unassigned=unassigned, warnings=warnings)


@uploads_router.post("", response=UploadCreateResponseSchema)
def create_upload(request):
    require_staff(request)

    file = request.FILES.get("file")
    if not file:
        raise HttpError(400, "Missing zip file (field: file)")

    lecture_id = request.POST.get("lecture_id")
    year = request.POST.get("year")
    semester = (request.POST.get("semester") or "").upper()
    professors = request.POST.get("professors", "")
    assistants = request.POST.get("assistants", "")
    fs_path = request.POST.get("fs_path", "")

    if not lecture_id or not year or not semester:
        raise HttpError(400, "lecture_id, year, and semester are required")
    try:
        lecture_id = int(lecture_id)
        year = int(year)
    except ValueError:
        raise HttpError(400, "Invalid lecture_id or year")
    if semester not in {"HS", "FS"}:
        raise HttpError(400, "semester must be HS or FS")

    lecture = get_object_or_404(Lecture, id=lecture_id)
    if not fs_path:
        fs_path = f"{lecture.name}/{year}{semester}"

    job = UploadJob.objects.create(
        user=request.user,
        lecture=lecture,
        year=year,
        semester=semester,
        professors=professors,
        assistants=assistants,
        fs_path=fs_path,
        status=UploadJob.Status.UPLOADED,
        source_filename=file.name,
    )

    job_dir = _uploads_root() / f"job_{job.id}"
    extract_dir = job_dir / "extracted"
    job_dir.mkdir(parents=True, exist_ok=True)
    zip_path = job_dir / "source.zip"
    with open(zip_path, "wb") as fh:
        for chunk in file.chunks():
            fh.write(chunk)

    _safe_extract_zip(zip_path, extract_dir)
    root_dir = _detect_root(extract_dir)

    report = _detect_series(root_dir)
    job.upload_dir = str(root_dir)
    job.report_json = report.dict()
    job.status = UploadJob.Status.VALIDATED
    job.save(update_fields=["upload_dir", "report_json", "status", "updated_at", "fs_path"])

    return UploadCreateResponseSchema(
        id=job.id,
        status=job.status,
        fs_path=job.fs_path,
        report=report,
    )


@uploads_router.get("/{job_id}", response=UploadCreateResponseSchema)
def get_upload(request, job_id: int):
    require_staff(request)
    job = get_object_or_404(UploadJob, id=job_id)
    report = job.report_json or {"root": "", "series": [], "unassigned": [], "warnings": []}
    return UploadCreateResponseSchema(
        id=job.id,
        status=job.status,
        fs_path=job.fs_path,
        report=report,
    )


@uploads_router.post("/{job_id}/commit")
def commit_upload(request, job_id: int, payload: UploadCommitSchema):
    require_staff(request)
    job = get_object_or_404(UploadJob, id=job_id)
    if job.status not in {UploadJob.Status.VALIDATED, UploadJob.Status.UPLOADED}:
        raise HttpError(400, "Upload job is not in a committable state")

    root_dir = Path(job.upload_dir)
    if not root_dir.exists():
        raise HttpError(400, "Upload files are missing on server")

    report_series = (job.report_json or {}).get("series", [])
    series_list = payload.series or [UploadCommitSeriesSchema(**s) for s in report_series]

    if not series_list:
        raise HttpError(400, "No series detected to import")

    seen_numbers: set[int] = set()
    for s in series_list:
        if s.number in seen_numbers:
            raise HttpError(400, f"Duplicate series number: {s.number}")
        seen_numbers.add(s.number)
        if s.pdf_file:
            if not (root_dir / s.pdf_file).is_file():
                raise HttpError(400, f"PDF not found: {s.pdf_file}")
        else:
            raise HttpError(400, f"Missing PDF for series {s.number}")
        if s.tex_file and not (root_dir / s.tex_file).is_file():
            raise HttpError(400, f"TeX not found: {s.tex_file}")
        if s.solution_file and not (root_dir / s.solution_file).is_file():
            raise HttpError(400, f"Solution PDF not found: {s.solution_file}")

    dest_root = Path(settings.LECTURE_MEDIA_ROOT) / job.fs_path
    if dest_root.exists() and any(dest_root.iterdir()) and not payload.overwrite:
        raise HttpError(409, "Destination already exists; set overwrite=true to merge")

    dest_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(root_dir, dest_root, dirs_exist_ok=True)

    with transaction.atomic():
        sem, _ = SemesterGroup.objects.get_or_create(
            lecture=job.lecture,
            year=job.year,
            semester=job.semester,
            defaults={
                "professors": job.professors,
                "assistants": job.assistants,
                "fs_path": job.fs_path,
            },
        )
        sem.professors = job.professors
        sem.assistants = job.assistants
        sem.fs_path = job.fs_path
        sem.save(update_fields=["professors", "assistants", "fs_path"])

        for s in series_list:
            Series.objects.update_or_create(
                semester_group=sem,
                number=s.number,
                defaults={
                    "title": s.title or "",
                    "tex_file": s.tex_file or "",
                    "pdf_file": s.pdf_file or "",
                    "solution_file": s.solution_file or "",
                },
            )

    job.status = UploadJob.Status.IMPORTED
    job.save(update_fields=["status", "updated_at"])

    return {"status": "imported", "semester_group_id": sem.id}
