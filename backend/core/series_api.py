from pathlib import Path
from typing import Optional

from django.conf import settings
from django.shortcuts import get_object_or_404
from ninja import Router, Schema, File, Form
from ninja.files import UploadedFile
from ninja.errors import HttpError
from ninja.security import django_auth

from .models import SemesterGroup, Series
from .permissions import has_course_access

router = Router(auth=django_auth)


def _ensure_storage_root(sem_group: SemesterGroup) -> Path:
    if not sem_group.fs_path:
        raise HttpError(400, "Semester group storage path is not configured.")
    root_path = Path(settings.LECTURE_MEDIA_ROOT) / sem_group.fs_path
    try:
        root_path.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise HttpError(500, "Could not access storage directory.")
    return root_path


def _save_uploaded(file_obj: UploadedFile, target_path: Path) -> str:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        for chunk in file_obj.chunks():
            f.write(chunk)
    return target_path.name

class SeriesUploadSchema(Schema):
    number: int
    title: str = ""
    target_solution_file: str = "" # e.g. "solution.pdf"

class SeriesUploadResponseSchema(Schema):
    id: int
    number: int
    title: str
    tex_file: str
    pdf_file: str
    solution_file: str


def _apply_uploads_to_series(
    *,
    series: Series,
    root_path: Path,
    number: int,
    title: Optional[str],
    tex: UploadedFile | None,
    pdf: UploadedFile | None,
    solution: UploadedFile | None,
):
    if title is not None:
        series.title = title

    def normalized_name(prefix: str, upload: UploadedFile, default_ext: str) -> str:
        # keep extension if provided, else default
        suffix = Path(upload.name).suffix or default_ext
        return f"{prefix}_{number}{suffix}"

    if tex:
        name = normalized_name("sheet", tex, ".tex")
        series.tex_file = _save_uploaded(tex, root_path / name)
    if pdf:
        name = normalized_name("sheet", pdf, ".pdf")
        series.pdf_file = _save_uploaded(pdf, root_path / name)
    if solution:
        name = normalized_name("solution", solution, ".pdf")
        series.solution_file = _save_uploaded(solution, root_path / name)

    series.save()
    return series


@router.post("/semester_groups/{group_id}/series/{number}/upload", response=SeriesUploadResponseSchema)
def upload_series(
    request, 
    group_id: int, 
    number: int, 
    title: Optional[str] = Form(None),
    tex: UploadedFile = File(None),
    pdf: UploadedFile = File(None),
    solution: UploadedFile = File(None)
):
    """
    Upload files for a specific series.
    Overwrites existing files if they exist (no version bump).
    """
    sem_group = get_object_or_404(SemesterGroup, id=group_id)
    
    if not has_course_access(request.user, sem_group):
        raise HttpError(403, "You do not have permission to edit this course.")

    root_path = _ensure_storage_root(sem_group)
    series, _ = Series.objects.get_or_create(
        semester_group=sem_group,
        number=number,
        defaults={"title": title or f"Series {number}"}
    )
    series = _apply_uploads_to_series(
        series=series,
        root_path=root_path,
        number=number,
        title=title,
        tex=tex,
        pdf=pdf,
        solution=solution,
    )

    return SeriesUploadResponseSchema(
        id=series.id,
        number=series.number,
        title=series.title,
        tex_file=series.tex_file,
        pdf_file=series.pdf_file,
        solution_file=series.solution_file,
    )


@router.delete("/series/{series_id}", response={204: None, 403: dict})
def delete_series(request, series_id: int):
    series = get_object_or_404(Series, id=series_id)
    if not has_course_access(request.user, series.semester_group):
        return 403, {"message": "You do not have permission to edit this course."}
    series.soft_delete(user=request.user, reason="Series deleted via API")
    return 204, None


@router.post("/series/{series_id}/replace", response=SeriesUploadResponseSchema)
def replace_series(
    request,
    series_id: int,
    title: Optional[str] = Form(None),
    tex: UploadedFile = File(None),
    pdf: UploadedFile = File(None),
    solution: UploadedFile = File(None),
):
    """
    Replace a series with a new version.
    - Soft deletes the old row (keeps archived files).
    - Creates a new row with the same number and links lineage.
    """
    old_series = get_object_or_404(Series, id=series_id)
    if not has_course_access(request.user, old_series.semester_group):
        raise HttpError(403, "You do not have permission to edit this course.")

    if not any([tex, pdf, solution]):
        raise HttpError(400, "Provide at least one file to upload.")

    root_path = _ensure_storage_root(old_series.semester_group)
    old_series.soft_delete(user=request.user, reason="Series replaced")

    new_series = Series.objects.create(
        semester_group=old_series.semester_group,
        number=old_series.number,
        title=title or old_series.title,
        replaces=old_series,
    )
    old_series.superseded_by = new_series
    old_series.save(update_fields=["superseded_by"])

    new_series = _apply_uploads_to_series(
        series=new_series,
        root_path=root_path,
        number=new_series.number,
        title=title or old_series.title,
        tex=tex,
        pdf=pdf,
        solution=solution,
    )

    return SeriesUploadResponseSchema(
        id=new_series.id,
        number=new_series.number,
        title=new_series.title,
        tex_file=new_series.tex_file,
        pdf_file=new_series.pdf_file,
        solution_file=new_series.solution_file,
    )
