import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

from .models import RenderJob, Series

LOG_LIMIT_CHARS = 200_000
_SERIES_LINE_RE = re.compile(r"^Series\s+(?P<id>\d+):\s+(?P<msg>.*)$")


@dataclass
class _JobState:
    completed_series: set[int]
    last_flush_at: float
    log: str


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

    # Preserve the latest counters even if the final incremental flush was rate-limited.
    processed_count = job.processed_count
    rendered_count = job.rendered_count
    skipped_count = job.skipped_count
    failed_count = job.failed_count
    current_series_id = job.current_series_id
    total_count = job.total_count

    # Refresh status in case cancellation was requested while the process was running.
    job = RenderJob.objects.get(id=job_id)
    finished_at = timezone.now()

    if not finalize:
        RenderJob.objects.filter(id=job_id).update(
            pid=None,
            return_code=rc,
            output_log=state.log,
            total_count=total_count,
            processed_count=processed_count,
            rendered_count=rendered_count,
            skipped_count=skipped_count,
            failed_count=failed_count,
            current_series_id=current_series_id,
            updated_at=finished_at,
        )
        return

    final_status = job.status
    if final_status != RenderJob.Status.CANCELLED:
        if rc != 0:
            final_status = RenderJob.Status.FAILED
        elif failed_count > 0:
            final_status = RenderJob.Status.FAILED
        else:
            final_status = RenderJob.Status.SUCCEEDED

    RenderJob.objects.filter(id=job_id).update(
        status=final_status,
        finished_at=finished_at,
        pid=None,
        return_code=rc,
        output_log=state.log,
        total_count=total_count,
        processed_count=processed_count,
        rendered_count=rendered_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        current_series_id=current_series_id,
        updated_at=finished_at,
    )


def run_render_job(job_id: int) -> None:
    close_old_connections()
    job = RenderJob.objects.get(id=job_id)

    if job.status == RenderJob.Status.CANCELLED:
        return

    try:
        if job.scope == RenderJob.Scope.SERIES:
            series_ids = [
                int(x)
                for x in (job.series_ids or [])
                if isinstance(x, int) or str(x).isdigit()
            ]
            series_ids = sorted(set(series_ids))
            total = len(series_ids)
            argv = ["render_series_html"]
            for series_id in series_ids:
                argv.extend(["--series-id", str(series_id)])
            if job.force:
                argv.append("--force")
            _run_command_for_job(job.id, argv, total_override=total)
            return

        argv = ["render_series_html"]
        if job.force:
            argv.append("--force")
        _run_command_for_job(job.id, argv, total_override=Series.objects.count())
    except Exception as exc:  # noqa: BLE001
        now = timezone.now()
        RenderJob.objects.filter(id=job.id).update(
            status=RenderJob.Status.FAILED,
            error_message=str(exc),
            finished_at=now,
            updated_at=now,
        )
