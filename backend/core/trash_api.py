from datetime import datetime
from typing import List, Optional

from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.errors import HttpError

from .models import Lecture, SemesterGroup, Series

router = Router()


def require_staff(request):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.is_staff:
        raise HttpError(403, "Staff only")


class TrashLectureSchema(Schema):
    id: int
    name: str
    long_name: str
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[int] = None
    deleted_by_username: Optional[str] = None


class TrashSemesterSchema(Schema):
    id: int
    lecture_id: int
    lecture_name: str
    year: int
    semester: str
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[int] = None
    deleted_by_username: Optional[str] = None


class TrashSeriesSchema(Schema):
    id: int
    semester_group_id: int
    lecture_id: int
    lecture_name: str
    year: int
    semester: str
    number: int
    title: str = ""
    replaces_id: Optional[int] = None
    superseded_by_id: Optional[int] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[int] = None
    deleted_by_username: Optional[str] = None


class TrashResponseSchema(Schema):
    lectures: List[TrashLectureSchema]
    semesters: List[TrashSemesterSchema]
    series: List[TrashSeriesSchema]


@router.get("", response=TrashResponseSchema)
def list_trash(request):
    require_staff(request)

    lectures = (
        Lecture.all_objects.filter(is_deleted=True)
        .select_related("deleted_by")
        .order_by("-deleted_at")
    )
    semesters = (
        SemesterGroup.all_objects.filter(is_deleted=True)
        .select_related("lecture", "deleted_by")
        .order_by("-deleted_at")
    )
    series = (
        Series.all_objects.filter(is_deleted=True)
        .select_related("semester_group__lecture", "deleted_by")
        .order_by("-deleted_at")
    )

    lecture_rows = [
        TrashLectureSchema(
            id=lec.id,
            name=lec.name,
            long_name=lec.long_name,
            deleted_at=lec.deleted_at,
            deleted_by=lec.deleted_by_id,
            deleted_by_username=getattr(lec.deleted_by, "username", None),
        )
        for lec in lectures
    ]

    semester_rows = [
        TrashSemesterSchema(
            id=sg.id,
            lecture_id=sg.lecture_id,
            lecture_name=sg.lecture.long_name,
            year=sg.year,
            semester=sg.semester,
            deleted_at=sg.deleted_at,
            deleted_by=sg.deleted_by_id,
            deleted_by_username=getattr(sg.deleted_by, "username", None),
        )
        for sg in semesters
    ]

    series_rows = [
        TrashSeriesSchema(
            id=s.id,
            semester_group_id=s.semester_group_id,
            lecture_id=s.semester_group.lecture_id,
            lecture_name=s.semester_group.lecture.long_name,
            year=s.semester_group.year,
            semester=s.semester_group.semester,
            number=s.number,
            title=s.title or "",
            replaces_id=s.replaces_id,
            superseded_by_id=s.superseded_by_id,
            deleted_at=s.deleted_at,
            deleted_by=s.deleted_by_id,
            deleted_by_username=getattr(s.deleted_by, "username", None),
        )
        for s in series
    ]

    return TrashResponseSchema(
        lectures=lecture_rows,
        semesters=semester_rows,
        series=series_rows,
    )


@router.post("/lectures/{lecture_id}/restore", response={200: dict, 400: dict, 403: dict, 409: dict})
def restore_lecture(request, lecture_id: int):
    require_staff(request)
    lecture = get_object_or_404(Lecture.all_objects, id=lecture_id)
    if not lecture.is_deleted:
        return 400, {"message": "Lecture is not deleted."}
    if Lecture.objects.filter(name=lecture.name).exists():
        return 409, {"message": "An active lecture with the same name already exists."}
    if SemesterGroup.objects.filter(lecture=lecture).exists():
        return 409, {"message": "Active semester groups already exist for this lecture."}
    lecture.restore()
    return {"message": "Lecture restored."}


@router.post("/semester-groups/{group_id}/restore", response={200: dict, 400: dict, 403: dict, 409: dict})
def restore_semester_group(request, group_id: int):
    require_staff(request)
    group = get_object_or_404(SemesterGroup.all_objects, id=group_id)
    if not group.is_deleted:
        return 400, {"message": "Semester group is not deleted."}
    if group.lecture.is_deleted:
        return 409, {"message": "Lecture is deleted; restore the lecture first."}
    if SemesterGroup.objects.filter(
        lecture=group.lecture, year=group.year, semester=group.semester
    ).exists():
        return 409, {"message": "An active semester group already exists with the same term."}
    group.restore()
    return {"message": "Semester group restored."}


@router.post("/series/{series_id}/restore", response={200: dict, 400: dict, 403: dict, 409: dict})
def restore_series(request, series_id: int):
    require_staff(request)
    series = get_object_or_404(Series.all_objects, id=series_id)
    if not series.is_deleted:
        return 400, {"message": "Series is not deleted."}
    if series.semester_group.is_deleted:
        return 409, {"message": "Semester group is deleted; restore the semester first."}
    if Series.objects.filter(
        semester_group=series.semester_group, number=series.number
    ).exists():
        return 409, {"message": "An active series with the same number already exists."}
    series.restore()
    return {"message": "Series restored."}


@router.post("/lectures/{lecture_id}/purge", response={200: dict, 400: dict, 403: dict})
def purge_lecture(request, lecture_id: int):
    require_staff(request)
    lecture = get_object_or_404(Lecture.all_objects, id=lecture_id)
    if not lecture.is_deleted:
        return 400, {"message": "Lecture is not deleted."}
    lecture.purge()
    return {"message": "Lecture permanently removed."}


@router.post("/semester-groups/{group_id}/purge", response={200: dict, 400: dict, 403: dict})
def purge_semester_group(request, group_id: int):
    require_staff(request)
    group = get_object_or_404(SemesterGroup.all_objects, id=group_id)
    if not group.is_deleted:
        return 400, {"message": "Semester group is not deleted."}
    group.purge()
    return {"message": "Semester group permanently removed."}


@router.post("/series/{series_id}/purge", response={200: dict, 400: dict, 403: dict})
def purge_series(request, series_id: int):
    require_staff(request)
    series = get_object_or_404(Series.all_objects, id=series_id)
    if not series.is_deleted:
        return 400, {"message": "Series is not deleted."}
    series.purge()
    return {"message": "Series permanently removed."}
