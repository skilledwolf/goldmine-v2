from datetime import datetime

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError
import django_rq

from .models import RenderJob, Series
from .render_worker import run_render_job


render_router = Router()


def require_staff(request):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not request.user.is_staff:
        raise HttpError(403, "Staff only")


class RenderJobSchema(Schema):
    id: int
    status: str
    scope: str
    series_ids: list[int] | None = None
    force: bool
    total_count: int
    processed_count: int
    rendered_count: int
    skipped_count: int
    failed_count: int
    current_series_id: int | None = None
    pid: int | None = None
    return_code: int | None = None
    error_message: str = ""
    output_log: str = ""
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    updated_at: datetime
    user_id: int
    user_username: str


class RenderJobCreateSchema(Schema):
    scope: str = RenderJob.Scope.ALL
    series_ids: list[int] | None = None
    force: bool = False


class CancelResponseSchema(Schema):
    status: str


def _renderjob_to_schema(job: RenderJob, include_log: bool) -> RenderJobSchema:
    return RenderJobSchema(
        id=job.id,
        status=job.status,
        scope=job.scope,
        series_ids=job.series_ids if isinstance(job.series_ids, list) else None,
        force=job.force,
        total_count=job.total_count,
        processed_count=job.processed_count,
        rendered_count=job.rendered_count,
        skipped_count=job.skipped_count,
        failed_count=job.failed_count,
        current_series_id=job.current_series_id,
        pid=job.pid,
        return_code=job.return_code,
        error_message=job.error_message or "",
        output_log=job.output_log if include_log else "",
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        updated_at=job.updated_at,
        user_id=job.user_id,
        user_username=getattr(job.user, "username", str(job.user_id)),
    )

def _enqueue_job(job: RenderJob) -> None:
    queue = django_rq.get_queue("default")
    queue.enqueue(run_render_job, job.id, job_id=f"render-job-{job.id}")


@render_router.get("/jobs", response=list[RenderJobSchema])
def list_render_jobs(request, limit: int = 25):
    require_staff(request)
    limit = max(1, min(int(limit or 25), 200))
    jobs = (
        RenderJob.objects.select_related("user")
        .order_by("-created_at")[:limit]
    )
    return [_renderjob_to_schema(j, include_log=False) for j in jobs]


@render_router.get("/jobs/{job_id}", response=RenderJobSchema)
def get_render_job(request, job_id: int):
    require_staff(request)
    job = get_object_or_404(RenderJob.objects.select_related("user"), id=job_id)
    return _renderjob_to_schema(job, include_log=True)


@render_router.post("/jobs", response=RenderJobSchema)
def create_render_job(request, payload: RenderJobCreateSchema):
    require_staff(request)

    scope = (payload.scope or "").strip().lower()
    if scope not in {RenderJob.Scope.ALL, RenderJob.Scope.SERIES}:
        raise HttpError(400, "Invalid scope (expected 'all' or 'series')")

    if RenderJob.objects.filter(status__in=[RenderJob.Status.QUEUED, RenderJob.Status.RUNNING]).exists():
        raise HttpError(409, "A render job is already running")

    series_ids: list[int] | None = None
    total = 0
    if scope == RenderJob.Scope.SERIES:
        raw = payload.series_ids or []
        series_ids = sorted({int(x) for x in raw})
        if not series_ids:
            raise HttpError(400, "series_ids is required for scope='series'")
        existing = set(Series.objects.filter(id__in=series_ids).values_list("id", flat=True))
        missing = [sid for sid in series_ids if sid not in existing]
        if missing:
            raise HttpError(400, f"Unknown series id(s): {missing[:20]}")
        total = len(series_ids)
    else:
        total = Series.objects.count()

    job = RenderJob.objects.create(
        user=request.user,
        status=RenderJob.Status.QUEUED,
        scope=scope,
        series_ids=series_ids,
        force=bool(payload.force),
        total_count=total,
    )

    transaction.on_commit(lambda: _enqueue_job(job))
    job = RenderJob.objects.select_related("user").get(id=job.id)
    return _renderjob_to_schema(job, include_log=True)


@render_router.post("/jobs/{job_id}/cancel", response=CancelResponseSchema)
def cancel_render_job(request, job_id: int):
    require_staff(request)
    job = get_object_or_404(RenderJob, id=job_id)
    if job.status not in {RenderJob.Status.RUNNING, RenderJob.Status.QUEUED}:
        return CancelResponseSchema(status=job.status)

    now = timezone.now()
    RenderJob.objects.filter(id=job_id).update(status=RenderJob.Status.CANCELLED, updated_at=now)

    return CancelResponseSchema(status=RenderJob.Status.CANCELLED)
