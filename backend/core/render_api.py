import os
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import close_old_connections, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from .models import RenderJob, Series


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


LOG_LIMIT_CHARS = 200_000
_SERIES_LINE_RE = re.compile(r"^Series\s+(?P<id>\d+):\s+(?P<msg>.*)$")


@dataclass
class _JobState:
    completed_series: set[int]
    last_flush_at: float
    log: str


_RUNNING_LOCK = threading.Lock()
_RUNNING_PROCS: dict[int, subprocess.Popen[str]] = {}


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


def _append_log(state: _JobState, chunk: str) -> None:
    if not chunk:
        return
    state.log += chunk
    if len(state.log) > LOG_LIMIT_CHARS:
        state.log = state.log[-LOG_LIMIT_CHARS:]


def _flush_job(job_id: int, state: _JobState, **fields) -> None:
    now = time.time()
    if (now - state.last_flush_at) < 0.6 and not fields.get("_force"):
        return
    state.last_flush_at = now
    fields.pop("_force", None)

    update_fields = {
        "output_log": state.log,
        **fields,
        "updated_at": timezone.now(),
    }
    RenderJob.objects.filter(id=job_id).update(**update_fields)


def _run_command_for_job(
    job_id: int,
    argv: list[str],
    total_override: int | None = None,
    finalize: bool = True,
) -> None:
    close_old_connections()
    job = RenderJob.objects.select_related("user").get(id=job_id)

    state = _JobState(completed_series=set(), last_flush_at=0.0, log=job.output_log or "")

    def mark_completed(series_id: int, kind: str) -> None:
        if series_id in state.completed_series:
            return
        state.completed_series.add(series_id)
        job.processed_count += 1
        if kind == "rendered":
            job.rendered_count += 1
        elif kind == "skipped":
            job.skipped_count += 1
        elif kind == "failed":
            job.failed_count += 1

    def handle_line(line: str) -> None:
        _append_log(state, line)

        raw = line.strip()
        m = _SERIES_LINE_RE.match(raw)
        if not m:
            return

        series_id = int(m.group("id"))
        msg = (m.group("msg") or "").strip()

        job.current_series_id = series_id

        if msg.startswith("inserted "):
            return
        if msg == "rendered":
            mark_completed(series_id, "rendered")
            return
        if "up-to-date, skipping" in msg:
            mark_completed(series_id, "skipped")
            return

        # Anything else with the "Series N:" prefix is treated as a per-series failure.
        mark_completed(series_id, "failed")

    cmd = [sys.executable, str(Path(settings.BASE_DIR) / "manage.py"), *argv]
    env = os.environ.copy()
    env.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    proc = subprocess.Popen(
        cmd,
        cwd=str(settings.BASE_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    with _RUNNING_LOCK:
        _RUNNING_PROCS[job_id] = proc

    job.pid = proc.pid
    if total_override is not None:
        job.total_count = total_override
    _flush_job(
        job_id,
        state,
        status=RenderJob.Status.RUNNING,
        started_at=job.started_at or timezone.now(),
        pid=job.pid,
        total_count=job.total_count,
        processed_count=job.processed_count,
        rendered_count=job.rendered_count,
        skipped_count=job.skipped_count,
        failed_count=job.failed_count,
        current_series_id=job.current_series_id,
        _force=True,
    )

    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            # Stop early if cancelled.
            if RenderJob.objects.filter(id=job_id, status=RenderJob.Status.CANCELLED).exists():
                try:
                    proc.terminate()
                except Exception:
                    pass
            handle_line(line)
            _flush_job(
                job_id,
                state,
                processed_count=job.processed_count,
                rendered_count=job.rendered_count,
                skipped_count=job.skipped_count,
                failed_count=job.failed_count,
                current_series_id=job.current_series_id,
            )
    finally:
        try:
            proc.stdout and proc.stdout.close()
        except Exception:
            pass

    rc = proc.wait()
    job.return_code = rc

    with _RUNNING_LOCK:
        _RUNNING_PROCS.pop(job_id, None)

    # Refresh status in case cancellation was requested while the process was running.
    job = RenderJob.objects.get(id=job_id)
    finished_at = timezone.now()

    if not finalize:
        RenderJob.objects.filter(id=job_id).update(
            pid=None,
            return_code=rc,
            output_log=state.log,
            updated_at=finished_at,
        )
        return

    final_status = job.status
    if final_status != RenderJob.Status.CANCELLED:
        if rc != 0:
            final_status = RenderJob.Status.FAILED
        elif job.failed_count > 0:
            final_status = RenderJob.Status.FAILED
        else:
            final_status = RenderJob.Status.SUCCEEDED

    RenderJob.objects.filter(id=job_id).update(
        status=final_status,
        finished_at=finished_at,
        pid=None,
        return_code=rc,
        output_log=state.log,
        updated_at=finished_at,
    )


def _start_job(job: RenderJob) -> None:
    def runner():
        try:
            if job.scope == RenderJob.Scope.SERIES:
                series_ids = [int(x) for x in (job.series_ids or []) if isinstance(x, int) or str(x).isdigit()]
                series_ids = sorted(set(series_ids))
                total = len(series_ids)
                for series_id in series_ids:
                    # Stop before starting the next series if cancelled.
                    if RenderJob.objects.filter(id=job.id, status=RenderJob.Status.CANCELLED).exists():
                        break
                    # Keep total_count stable.
                    _run_command_for_job(
                        job.id,
                        ["render_series_html", "--series-id", str(series_id), *(["--force"] if job.force else [])],
                        total_override=total,
                        finalize=False,
                    )
                # Mark final state based on accumulated counts.
                final = RenderJob.objects.get(id=job.id)
                if final.status == RenderJob.Status.CANCELLED:
                    RenderJob.objects.filter(id=job.id).update(
                        finished_at=timezone.now(),
                        pid=None,
                        updated_at=timezone.now(),
                    )
                    return
                final_status = RenderJob.Status.SUCCEEDED if final.failed_count == 0 else RenderJob.Status.FAILED
                RenderJob.objects.filter(id=job.id).update(
                    status=final_status,
                    finished_at=timezone.now(),
                    pid=None,
                    return_code=0,
                    updated_at=timezone.now(),
                )
                return

            # scope == ALL
            _run_command_for_job(
                job.id,
                ["render_series_html", *(["--force"] if job.force else [])],
                total_override=Series.objects.count(),
            )
        except Exception as exc:  # noqa: BLE001
            now = timezone.now()
            RenderJob.objects.filter(id=job.id).update(
                status=RenderJob.Status.FAILED,
                error_message=str(exc),
                finished_at=now,
                updated_at=now,
            )

    thread = threading.Thread(target=runner, name=f"render-job-{job.id}", daemon=True)
    thread.start()


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

    transaction.on_commit(lambda: _start_job(job))
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

    with _RUNNING_LOCK:
        proc = _RUNNING_PROCS.get(job_id)
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:
            pass

    return CancelResponseSchema(status=RenderJob.Status.CANCELLED)
