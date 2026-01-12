'use client';

import { useMemo, useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RefreshCw, LayoutPanelTop, Rows } from 'lucide-react';

type SeriesIssue = {
  id: number;
  lecture_id: number;
  lecture_name: string;
  semester: string;
  year: number;
  number: number;
  title: string;
  tex_file: string;
  pdf_file: string;
  solution_file: string;
  render_status?: string | null;
  html_rendered_at?: string | null;
  issues: string[];
  fs_path: string;
};

const ISSUE_LABELS: Record<string, string> = {
  missing_tex_path: 'TeX path missing',
  tex_not_found: 'TeX file missing',
  missing_pdf_path: 'PDF path missing',
  pdf_not_found: 'PDF file missing',
  missing_solution_path: 'Solution path missing',
  solution_not_found: 'Solution file missing',
  missing_fs_path: 'fs_path missing',
  render_failed: 'HTML render failed / not rendered',
  html_empty: 'HTML empty despite render ok',
};

export default function IssuesPage() {
  const { data, error, isLoading, mutate } = useApiSWR<SeriesIssue[]>('/series/issues');
  const [search, setSearch] = useState('');
  const [lectureFilter, setLectureFilter] = useState<'all' | number>('all');
  const [semesterFilter, setSemesterFilter] = useState<'all' | 'HS' | 'FS'>('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [issueFilter, setIssueFilter] = useState<string[]>([]);
  const [groupedView, setGroupedView] = useState(true);

  const crumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'Issues', href: '/issues', isCurrent: true },
    ],
    []
  );
  useBreadcrumbs(crumbs);

  const availableLectures = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, string>();
    data.forEach((d) => map.set(d.lecture_id, d.lecture_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const availableYears = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((d) => d.year))).sort((a, b) => b - a);
  }, [data]);

  const availableIssueTypes = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.forEach((d) => d.issues.forEach((i) => set.add(i)));
    return Array.from(set);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();

    return data.filter((item) => {
      if (lectureFilter !== 'all' && item.lecture_id !== lectureFilter) return false;
      if (semesterFilter !== 'all' && item.semester !== semesterFilter) return false;
      if (yearFilter !== 'all' && item.year !== yearFilter) return false;
      if (issueFilter.length > 0 && !item.issues.some((i) => issueFilter.includes(i))) return false;
      if (q) {
        const hay = `${item.lecture_name} ${item.title} series ${item.number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, lectureFilter, semesterFilter, yearFilter, issueFilter, search]);

  const grouped = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, { key: string; label: string; items: SeriesIssue[] }>();
    filtered.forEach((item) => {
      const key = `${item.lecture_id}-${item.semester}-${item.year}`;
      const label = `${item.lecture_name} · ${item.semester}${item.year}`;
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(item);
    });
    return Array.from(map.values()).map((grp) => ({
      ...grp,
      items: grp.items.sort((a, b) => a.number - b.number),
    }));
  }, [filtered]);

  const renderIssues = (issues: string[]) => {
    if (!issues.length) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {issues.map((issue) => (
          <span
            key={issue}
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
          >
            {ISSUE_LABELS[issue] || issue}
          </span>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading issues…</div>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <span>Failed to load issues (staff only?).</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  const total = filtered.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Staff only</p>
          <h1 className="text-2xl font-semibold">Series Issues</h1>
          <p className="text-sm text-muted-foreground">{total} series with problems</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => mutate()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Search
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                placeholder="Lecture, series title, number…"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Lecture
              <select
                value={lectureFilter}
                onChange={(e) =>
                  setLectureFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                {availableLectures.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Semester
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value as typeof semesterFilter)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="HS">HS</option>
                <option value="FS">FS</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Year
              <select
                value={yearFilter}
                onChange={(e) =>
                  setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Issue types</div>
            <div className="flex flex-wrap gap-2">
              {availableIssueTypes.map((issue) => {
                const active = issueFilter.includes(issue);
                return (
                  <button
                    key={issue}
                    type="button"
                    onClick={() =>
                      setIssueFilter((prev) =>
                        prev.includes(issue) ? prev.filter((x) => x !== issue) : [...prev, issue]
                      )
                    }
                    className={`rounded-full border px-2 py-1 text-xs ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input bg-background text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {ISSUE_LABELS[issue] || issue}
                  </button>
                );
              })}
              {availableIssueTypes.length === 0 && (
                <span className="text-xs text-muted-foreground">No issue types found</span>
              )}
            </div>
            {issueFilter.length > 0 && (
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setIssueFilter([])}
              >
                Clear issue filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">View</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={groupedView ? 'secondary' : 'outline'}
                className="gap-1"
                onClick={() => setGroupedView(true)}
              >
                <LayoutPanelTop className="h-4 w-4" /> Grouped
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!groupedView ? 'secondary' : 'outline'}
                className="gap-1"
                onClick={() => setGroupedView(false)}
              >
                <Rows className="h-4 w-4" /> Flat list
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length} of {data?.length || 0}
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No issues detected. 🎉
          </CardContent>
        </Card>
      ) : groupedView ? (
        grouped.map((group) => (
          <Card key={group.key} className="border-primary/20">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{group.label}</div>
                <div className="text-xs text-muted-foreground">
                  {group.items.length} issue{group.items.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="divide-y rounded-md border">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 px-3 py-3 sm:grid-cols-[90px,1fr] sm:items-center"
                  >
                    <div className="text-sm font-medium">
                      Series {item.number}
                      {item.title ? ` — ${item.title}` : ''}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-secondary/50 px-2 py-0.5">
                          fs_path: {item.fs_path || '—'}
                        </span>
                        <span className="rounded bg-secondary/50 px-2 py-0.5">
                          tex: {item.tex_file || '—'}
                        </span>
                        <span className="rounded bg-secondary/50 px-2 py-0.5">
                          pdf: {item.pdf_file || '—'}
                        </span>
                        <span className="rounded bg-secondary/50 px-2 py-0.5">
                          sol: {item.solution_file || '—'}
                        </span>
                        {item.render_status && (
                          <span className="rounded bg-secondary/50 px-2 py-0.5">
                            render: {item.render_status}
                          </span>
                        )}
                      </div>
                      {renderIssues(item.issues)}
                      <div className="text-xs">
                        <a
                          href={`/series/${item.id}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Open series
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <div className="overflow-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lecture / Term</th>
                <th className="px-3 py-2">Series</th>
                <th className="px-3 py-2">Files</th>
                <th className="px-3 py-2">Issues</th>
                <th className="px-3 py-2">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{item.lecture_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.semester}
                      {item.year}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">
                      Series {item.number}
                      {item.title ? ` — ${item.title}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">fs_path: {item.fs_path || '—'}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    <div>tex: {item.tex_file || '—'}</div>
                    <div>pdf: {item.pdf_file || '—'}</div>
                    <div>sol: {item.solution_file || '—'}</div>
                    {item.render_status && <div>render: {item.render_status}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">{renderIssues(item.issues)}</td>
                  <td className="px-3 py-2 align-top text-xs">
                    <a
                      href={`/series/${item.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
