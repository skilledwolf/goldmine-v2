from typing import List, Optional
import html
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db.models import Prefetch, Q
from django.contrib.postgres.search import (
    SearchHeadline,
    SearchQuery,
    SearchRank,
    SearchVector,
    TrigramSimilarity,
)
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.security import django_auth

from .models import Exercise, Lecture, SemesterGroup, Series


def require_staff(request):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.is_staff:
        raise HttpError(403, "Staff only")


api = NinjaAPI(title="Gold Mine API", version="2.0.0", auth=django_auth)

class ExerciseSchema(Schema):
    id: int
    number: int
    title: str
    text_content: str

class SeriesSchema(Schema):
    id: int
    number: int
    title: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""
    html_content: str = ""
    html_rendered_at: datetime | None = None
    render_status: str | None = None
    render_log: str = ""
    exercises: List[ExerciseSchema] = []
    # Context for navigation
    lecture_name: str = ""
    semester: str = ""
    year: int = 0
    lecture_id: int = 0

class SemesterGroupListSchema(Schema):
    id: int
    year: int
    semester: str
    fs_path: str = ""

class SemesterGroupSchema(Schema):
    id: int
    year: int
    semester: str
    professors: str
    fs_path: str = ""
    series: List[SeriesSchema]

class LectureListSchema(Schema):
    id: int
    name: str
    long_name: str
    semester_groups: List[SemesterGroupListSchema]

class LectureSchema(Schema):
    id: int
    name: str
    long_name: str
    semester_groups: List[SemesterGroupSchema]


class LectureSearchSchema(Schema):
    id: int
    name: str
    long_name: str


class SeriesSearchSchema(Schema):
    id: int
    number: int
    title: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""
    lecture_name: str = ""
    semester: str = ""
    year: int = 0
    lecture_id: int = 0


class ExerciseResultSchema(Schema):
    id: int
    number: int
    title: str
    series_id: int
    series_number: int
    lecture_id: int
    lecture_name: str
    semester: str
    year: int
    snippet_html: str = ""


class SearchResponseSchema(Schema):
    lectures: List[LectureSearchSchema]
    series: List[SeriesSearchSchema]
    exercises: List[ExerciseResultSchema]


SEARCH_HEADLINE_START = "<<<gmhl>>>"
SEARCH_HEADLINE_END = "<<<gmhl_end>>>"


def _safe_snippet(headline: str | None) -> str:
    if not headline:
        return ""
    placeholder_start = "__GMHL_START__"
    placeholder_end = "__GMHL_END__"
    prepared = (
        headline.replace(SEARCH_HEADLINE_START, placeholder_start)
        .replace(SEARCH_HEADLINE_END, placeholder_end)
    )
    escaped = html.escape(prepared, quote=False)
    return escaped.replace(placeholder_start, "<mark>").replace(placeholder_end, "</mark>")


class LectureCreateSchema(Schema):
    name: str
    long_name: str


class SemesterGroupCreateSchema(Schema):
    year: int
    semester: str
    professors: str
    assistants: str
    fs_path: str = ""


class SeriesCreateSchema(Schema):
    number: int
    title: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""


class SeriesIssueSchema(Schema):
    id: int
    lecture_id: int
    lecture_name: str
    semester: str
    year: int
    number: int
    title: str = ""
    tex_file: str = ""
    pdf_file: str = ""
    solution_file: str = ""
    render_status: str | None = None
    html_rendered_at: datetime | None = None
    issues: List[str]
    fs_path: str = ""


@api.get("/series/issues", response=List[SeriesIssueSchema])
def list_series_issues(request):
    """Staff-only helper to surface series with missing/failed assets for triage."""
    require_staff(request)

    series_qs = Series.objects.select_related("semester_group__lecture")
    lecture_root = Path(settings.LECTURE_MEDIA_ROOT)
    issues: list[SeriesIssueSchema] = []

    for s in series_qs:
        s_issues: list[str] = []

        fs_path = (s.semester_group.fs_path or "").strip()
        semester_root = lecture_root / fs_path if fs_path else None

        def check_file(label: str, rel_path: str | None):
            if not rel_path or not rel_path.strip():
                s_issues.append(f"missing_{label}_path")
                return
            if not semester_root:
                s_issues.append("missing_fs_path")
                return
            try:
                full = (semester_root / rel_path).resolve()
                if not full.is_file():
                    s_issues.append(f"{label}_not_found")
            except OSError:
                s_issues.append(f"{label}_not_found")

        check_file("tex", s.tex_file)
        check_file("pdf", s.pdf_file)
        check_file("solution", s.solution_file)

        if s.render_status != Series.RenderStatus.OK:
            s_issues.append("render_failed")
        if s.render_status == Series.RenderStatus.OK and not (s.html_content or "").strip():
            s_issues.append("html_empty")

        if s_issues:
            issues.append(
                SeriesIssueSchema(
                    id=s.id,
                    lecture_id=s.semester_group.lecture.id,
                    lecture_name=s.semester_group.lecture.long_name,
                    semester=s.semester_group.semester,
                    year=s.semester_group.year,
                    number=s.number,
                    title=s.title,
                    tex_file=s.tex_file,
                    pdf_file=s.pdf_file,
                    solution_file=s.solution_file,
                    render_status=s.render_status,
                    html_rendered_at=s.html_rendered_at,
                    issues=s_issues,
                    fs_path=fs_path,
                )
            )

    issues.sort(key=lambda x: (-len(x.issues), x.lecture_name.lower(), x.year, x.semester, x.number))
    return issues


@api.get("/lectures", response=List[LectureListSchema])
def list_lectures(request, q: Optional[str] = None):
    qs = Lecture.objects.all().prefetch_related('semester_groups')
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(long_name__icontains=q))
    return qs

@api.get("/lectures/{lecture_id}", response=LectureSchema)
def get_lecture(request, lecture_id: int):
    return get_object_or_404(
        Lecture.objects.prefetch_related(
            Prefetch('semester_groups', queryset=SemesterGroup.objects.prefetch_related('series__exercises'))
        ),
        id=lecture_id
    )

@api.get("/series/{series_id}", response=SeriesSchema)
def get_series(request, series_id: int):
    series = get_object_or_404(
        Series.objects.select_related('semester_group__lecture').prefetch_related('exercises'),
        id=series_id
    )
    series.lecture_name = series.semester_group.lecture.long_name
    series.semester = series.semester_group.semester
    series.year = series.semester_group.year
    series.lecture_id = series.semester_group.lecture.id
    include_html = request.GET.get("include_html") in {"1", "true", "yes"}
    if not include_html:
        series.html_content = ""  # avoid shipping large payloads by default

    if not request.user.is_staff:
        series.render_log = ""
    return series


@api.get("/lectures/{lecture_id}/series", response=List[SeriesSchema])
def list_series_for_lecture(request, lecture_id: int):
    lecture = get_object_or_404(Lecture, id=lecture_id)
    series = Series.objects.filter(semester_group__lecture=lecture).select_related('semester_group__lecture').prefetch_related('exercises')
    for s in series:
        s.lecture_name = s.semester_group.lecture.long_name
        s.semester = s.semester_group.semester
        s.year = s.semester_group.year
        s.lecture_id = s.semester_group.lecture.id
    return list(series)


@api.get("/search", response=SearchResponseSchema)
def search(
    request,
    q: Optional[str] = None,
    lecture_id: Optional[int] = None,
    year: Optional[int] = None,
    semester: Optional[str] = None,
    professor: Optional[str] = None,
):
    """
    Search across lectures, series, and exercises.
    - q uses Postgres full-text search against rendered HTML-derived text.
    - lecture_id/year/semester/professor narrow the scope.
    """
    q = (q or "").strip()
    semester = semester.upper() if semester else None

    lect_qs = Lecture.objects.all().prefetch_related('semester_groups')
    if q:
        search_query = SearchQuery(q, search_type="websearch", config="simple")
        vector = (
            SearchVector("name", weight="A", config="simple")
            + SearchVector("long_name", weight="B", config="simple")
        )
        rank = SearchRank(vector, search_query, cover_density=True)
        similarity = TrigramSimilarity("name", q) + TrigramSimilarity("long_name", q)
        lect_qs = lect_qs.annotate(rank=rank, similarity=similarity).filter(
            Q(rank__gte=0.05) | Q(similarity__gte=0.2)
        )
        lect_qs = lect_qs.order_by("-rank", "-similarity")

    sg_filters = {}
    if lecture_id:
        sg_filters["lecture_id"] = lecture_id
    if year:
        sg_filters["year"] = year
    if semester:
        sg_filters["semester__iexact"] = semester
    if professor:
        sg_filters["professors__icontains"] = professor
    semester_groups = SemesterGroup.objects.filter(**sg_filters) if sg_filters else None

    series_qs = Series.objects.select_related('semester_group__lecture')
    if semester_groups is not None:
        series_qs = series_qs.filter(semester_group__in=semester_groups)
    if q:
        number_filter = Q()
        try:
            number_filter = Q(number=int(q))
        except (TypeError, ValueError):
            number_filter = Q()
        search_query = SearchQuery(q, search_type="websearch", config="simple")
        vector = (
            SearchVector("title", weight="A", config="simple")
            + SearchVector("semester_group__lecture__name", weight="B", config="simple")
            + SearchVector("semester_group__lecture__long_name", weight="C", config="simple")
        )
        rank = SearchRank(vector, search_query, cover_density=True)
        similarity = TrigramSimilarity("title", q)
        series_qs = series_qs.annotate(rank=rank, similarity=similarity).filter(
            Q(rank__gte=0.05) | Q(similarity__gte=0.2) | number_filter
        )
        series_qs = series_qs.order_by("-rank", "-similarity", "-semester_group__year", "number")
    else:
        series_qs = series_qs.order_by("-semester_group__year", "number")

    exercises_qs = Exercise.objects.select_related('series__semester_group__lecture')
    if semester_groups is not None:
        exercises_qs = exercises_qs.filter(series__semester_group__in=semester_groups)
    if q:
        number_filter = Q()
        try:
            number_filter = Q(number=int(q))
        except (TypeError, ValueError):
            number_filter = Q()
        search_query = SearchQuery(q, search_type="websearch", config="simple")
        vector = (
            SearchVector("title", weight="A", config="simple")
            + SearchVector("search_text", weight="B", config="simple")
            + SearchVector("series__title", weight="C", config="simple")
        )
        rank = SearchRank(vector, search_query, cover_density=True)
        similarity = TrigramSimilarity("title", q) + TrigramSimilarity("search_text", q)
        headline = SearchHeadline(
            "search_text",
            search_query,
            config="simple",
            start_sel=SEARCH_HEADLINE_START,
            stop_sel=SEARCH_HEADLINE_END,
            max_words=35,
            min_words=12,
            short_word=2,
            highlight_all=False,
        )
        exercises_qs = exercises_qs.annotate(
            rank=rank,
            similarity=similarity,
            headline=headline,
        ).filter(
            Q(rank__gte=0.05) | Q(similarity__gte=0.2) | number_filter
        )
        exercises_qs = exercises_qs.order_by(
            "-rank",
            "-similarity",
            "-series__semester_group__year",
            "series__number",
            "number",
        )
    else:
        exercises_qs = exercises_qs.order_by(
            "-series__semester_group__year",
            "series__number",
            "number",
        )

    # Limit results to prevent payload bloat
    lect_qs = lect_qs[:5]
    series_qs = series_qs[:10]
    exercises_qs = exercises_qs[:20]

    # Build enriched series objects
    series_results = []
    for s in series_qs:
        s.lecture_name = s.semester_group.lecture.long_name
        s.semester = s.semester_group.semester
        s.year = s.semester_group.year
        s.lecture_id = s.semester_group.lecture.id
        series_results.append(s)

    exercise_results: List[ExerciseResultSchema] = []
    for ex in exercises_qs:
        sg = ex.series.semester_group
        lec = sg.lecture
        snippet_html = _safe_snippet(getattr(ex, "headline", None)) if q else ""
        exercise_results.append(
            ExerciseResultSchema(
                id=ex.id,
                number=ex.number,
                title=ex.title,
                series_id=ex.series.id,
                series_number=ex.series.number,
                lecture_id=lec.id,
                lecture_name=lec.long_name,
                semester=sg.semester,
                year=sg.year,
                snippet_html=snippet_html,
            )
        )

    return SearchResponseSchema(
        lectures=list(lect_qs),
        series=series_results,
        exercises=exercise_results,
    )


@api.post("/lectures", response=LectureSchema)
def create_lecture(request, payload: LectureCreateSchema):
    require_staff(request)
    lecture = Lecture.objects.create(**payload.dict())
    return lecture


@api.post("/lectures/{lecture_id}/semester_groups", response=SemesterGroupSchema)
def add_semester_group(request, lecture_id: int, payload: SemesterGroupCreateSchema):
    require_staff(request)
    lecture = get_object_or_404(Lecture, id=lecture_id)
    sem_group, _ = SemesterGroup.objects.get_or_create(lecture=lecture, **payload.dict())
    sem_group = SemesterGroup.objects.prefetch_related('series__exercises').get(id=sem_group.id)
    return sem_group


@api.post("/semester_groups/{semester_group_id}/series", response=SeriesSchema)
def add_series(request, semester_group_id: int, payload: SeriesCreateSchema):
    require_staff(request)
    sg = get_object_or_404(SemesterGroup, id=semester_group_id)
    series, _ = Series.objects.get_or_create(semester_group=sg, **payload.dict())
    series = Series.objects.select_related('semester_group__lecture').prefetch_related('exercises').get(id=series.id)
    series.lecture_name = series.semester_group.lecture.long_name
    series.semester = series.semester_group.semester
    series.year = series.semester_group.year
    series.lecture_id = series.semester_group.lecture.id
    return series



from .auth_api import router as auth_router
from .files_api import files_router
from .comments_api import router as comments_router
from .uploads_api import uploads_router
from .render_api import render_router

api.add_router("/auth", auth_router)
api.add_router("/files", files_router)
api.add_router("/comments", comments_router)
api.add_router("/uploads", uploads_router)
api.add_router("/render", render_router)
