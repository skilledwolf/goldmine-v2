'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, Square, ShieldAlert } from 'lucide-react';

type Me = { id: number; username: string; is_staff?: boolean } | { message: string };

type RenderJob = {
  id: number;
  status: string;
  scope: string;
  series_ids?: number[] | null;
  force: boolean;
  total_count: number;
  processed_count: number;
  rendered_count: number;
  skipped_count: number;
  failed_count: number;
  current_series_id?: number | null;
  pid?: number | null;
  return_code?: number | null;
  error_message?: string;
  output_log?: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
  user_id: number;
  user_username: string;
};

type RenderJobCreatePayload = {
  scope: 'all' | 'series';
  series_ids?: number[];
  force?: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function clampInt(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export default function RenderJobsPage() {
  const crumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'HTML Render', href: '/render', isCurrent: true },
    ],
    []
  );
  useBreadcrumbs(crumbs);

  const fetcher = <T,>(key: string) => apiFetch<T>(key);

  const { data: me } = useSWR<Me>('/auth/me', fetcher);
  const isStaff = !!(me && !('message' in me) && me.is_staff);

  const {
    data: jobs,
    error,
    isLoading,
    mutate: mutateJobs,
  } = useSWR<RenderJob[]>('/render/jobs?limit=25', fetcher, { refreshInterval: 5000 });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId !== null) return;
    if (!jobs || jobs.length === 0) return;
    setSelectedId(jobs[0].id);
  }, [jobs, selectedId]);

  const selectedJobSummary = useMemo(() => {
    if (!jobs || selectedId === null) return null;
    return jobs.find((j) => j.id === selectedId) ?? null;
  }, [jobs, selectedId]);

  const shouldPollSelectedJob =
    !!selectedJobSummary && (selectedJobSummary.status === 'queued' || selectedJobSummary.status === 'running');

  const {
    data: job,
    mutate: mutateJob,
  } = useSWR<RenderJob>(selectedId ? `/render/jobs/${selectedId}` : null, fetcher, {
    refreshInterval: shouldPollSelectedJob ? 1000 : 0,
  });

  const [seriesIdInput, setSeriesIdInput] = useState('');
  const [force, setForce] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const canCancel = job?.status === 'running' || job?.status === 'queued';

  const progress = useMemo(() => {
    const total = job?.total_count || 0;
    const done = job?.processed_count || 0;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return { total, done, pct };
  }, [job]);

  const startJob = async (payload: RenderJobCreatePayload) => {
    setStarting(true);
    setStartError(null);
    try {
      const created = await apiFetch<RenderJob>('/render/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSelectedId(created.id);
      await mutateJobs();
      await mutateJob();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start render job';
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  const startAll = async (forceFlag: boolean) => {
    await startJob({ scope: 'all', force: forceFlag });
  };

  const startSeries = async () => {
    const id = clampInt(seriesIdInput);
    if (!id) {
      setStartError('Please enter a valid numeric series id.');
      return;
    }
    await startJob({ scope: 'series', series_ids: [id], force });
  };

  const cancelSelected = async () => {
    if (!job) return;
    try {
      await apiFetch(`/render/jobs/${job.id}/cancel`, { method: 'POST' });
      await mutateJobs();
      await mutateJob();
    } catch (err) {
      console.warn('Cancel failed', err);
    }
  };

  if (!isStaff) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <span>Staff only.</span>
        </div>
        <div className="text-sm text-muted-foreground">
          This page triggers TeX → HTML rendering jobs on the backend.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <span>Failed to load render jobs.</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => mutateJobs()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff only</p>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            HTML Render Jobs
          </h1>
          <p className="text-muted-foreground mt-2">
            Trigger and monitor TeX → HTML compilation on the backend.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutateJobs()}
          className="gap-2 self-start md:self-center shadow-sm hover:bg-muted"
          disabled={isLoading}
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="font-medium">Start a job</div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-2"
                onClick={() => startAll(false)}
                disabled={starting}
                title="Render all series; up-to-date series will be skipped"
              >
                <Play className="h-4 w-4" /> Render all
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => startAll(true)}
                disabled={starting}
                title="Force re-render even if checksum matches"
              >
                <Play className="h-4 w-4" /> Render all (force)
              </Button>
            </div>

            <div className="pt-2 border-t border-border/50 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Render one series</div>
              <div className="flex items-center gap-2">
                <input
                  value={seriesIdInput}
                  onChange={(e) => setSeriesIdInput(e.target.value)}
                  className="w-32 rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Series id"
                  inputMode="numeric"
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Force
                </label>
                <Button size="sm" onClick={startSeries} disabled={starting} className="gap-2">
                  <Play className="h-4 w-4" /> Go
                </Button>
              </div>
              {startError && <div className="text-sm text-destructive">{startError}</div>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-medium mb-3">Jobs</div>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !jobs || jobs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No jobs yet.</div>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => {
                  const active = selectedId === j.id;
                  const total = j.total_count || 0;
                  const pct = total > 0 ? Math.min(100, Math.round((j.processed_count / total) * 100)) : 0;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSelectedId(j.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-border/50 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-xs text-muted-foreground">#{j.id}</div>
                        <div className="text-xs text-muted-foreground">{j.status}</div>
                      </div>
                      <div className="mt-1 text-sm">
                        {j.scope === 'all' ? 'All series' : `Series ${Array.isArray(j.series_ids) ? j.series_ids.join(', ') : ''}`}
                        {j.force ? ' (force)' : ''}
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {j.processed_count}/{j.total_count}
                        </span>
                        <span>
                          ok {j.rendered_count} · skip {j.skipped_count} · fail {j.failed_count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Details</div>
              {job && (
                <div className="flex items-center gap-2">
                  {canCancel && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={cancelSelected}>
                      <Square className="h-4 w-4" /> Cancel
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => mutateJob()}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                </div>
              )}
            </div>

            {!job ? (
              <div className="text-sm text-muted-foreground">Select a job on the left.</div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Status</div>
                    <div className="font-medium">{job.status}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Started</div>
                    <div className="font-medium">{formatDate(job.started_at) || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Progress</div>
                    <div className="font-medium">
                      {progress.done}/{progress.total} ({progress.pct}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Current series</div>
                    <div className="font-medium">{job.current_series_id ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">By</div>
                    <div className="font-medium">{job.user_username}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Finished</div>
                    <div className="font-medium">{formatDate(job.finished_at) || '—'}</div>
                  </div>
                </div>

                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
                </div>

                <div className="text-xs text-muted-foreground">
                  ok {job.rendered_count} · skip {job.skipped_count} · fail {job.failed_count}
                </div>

                {job.error_message && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {job.error_message}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <div className="font-medium">Log (tail)</div>
            {!job ? (
              <div className="text-sm text-muted-foreground">Select a job to view logs.</div>
            ) : (
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border bg-background/50 p-3 text-xs font-mono text-muted-foreground">
                {(job.output_log || '').slice(-40000) || '—'}
              </pre>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
