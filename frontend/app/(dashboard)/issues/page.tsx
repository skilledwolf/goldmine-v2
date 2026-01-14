'use client';

import { useMemo, useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Card } from '@/components/ui/card';
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff only</p>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              Series Issues
            </h1>
            <div className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
              {total} found
            </div>
          </div>
          <p className="text-muted-foreground mt-2">
            Overview of configuration errors, missing files, and render failures.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => mutate()} className="gap-2 self-start md:self-center shadow-sm hover:bg-muted">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-primary/10 bg-card/50 p-4 shadow-sm backdrop-blur-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background/50 pl-9 pr-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                placeholder="Search lecture, series title, number..."
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <span className="text-xs">🔍</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={lectureFilter}
                onChange={(e) =>
                  setLectureFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="all">All Lectures</option>
                {availableLectures.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value as typeof semesterFilter)}
                className="rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="all">All Semesters</option>
                <option value="HS">HS</option>
                <option value="FS">FS</option>
              </select>
              <select
                value={yearFilter}
                onChange={(e) =>
                  setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="all">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">Filter by issue type</div>
              {issueFilter.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setIssueFilter([])}
                >
                  Clear filters
                </button>
              )}
            </div>
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
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${active
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'border-input bg-background/50 text-muted-foreground hover:border-destructive/30 hover:text-foreground'
                      }`}
                  >
                    {ISSUE_LABELS[issue] || issue}
                  </button>
                );
              })}
              {availableIssueTypes.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No unique issue types found.</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {data?.length || 0} items
            </span>
            <div className="flex rounded-md shadow-sm">
              <button
                type="button"
                className={`flex items-center gap-1 rounded-l-md border px-3 py-1.5 text-xs font-medium transition-colors ${groupedView
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-muted text-muted-foreground'
                  }`}
                onClick={() => setGroupedView(true)}
              >
                <LayoutPanelTop className="h-3.5 w-3.5" /> Grouped
              </button>
              <button
                type="button"
                className={`flex items-center gap-1 rounded-r-md border-y border-r px-3 py-1.5 text-xs font-medium transition-colors ${!groupedView
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-muted text-muted-foreground'
                  }`}
                onClick={() => setGroupedView(false)}
              >
                <Rows className="h-3.5 w-3.5" /> List
              </button>
            </div>
          </div>
        </div>


        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border/50 bg-card/30">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <ShieldAlert className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold">No issues found</h3>
            <p className="text-muted-foreground text-sm">Everything looks good with your current filters.</p>
          </div>
        ) : groupedView ? (
          <div className="grid gap-6">
            {grouped.map((group) => (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary/50" />
                  <h3 className="text-md font-semibold text-foreground">{group.label}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {group.items.length}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex flex-col justify-between rounded-lg border border-destructive/20 bg-card hover:border-destructive/40 transition-colors p-4 shadow-sm"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-xs font-medium text-muted-foreground">Series {item.number}</span>
                          <a
                            href={`/series/${item.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View →
                          </a>
                        </div>
                        <h4 className="font-semibold text-sm line-clamp-2" title={item.title}>
                          {item.title || 'Untitled Series'}
                        </h4>

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.issues.map((issue) => (
                            <span
                              key={issue}
                              className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 border border-red-500/20"
                            >
                              {ISSUE_LABELS[issue] || issue}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground font-mono">
                        <div className="flex flex-col">
                          <span className="opacity-50">TeX Status</span>
                          <span className={item.tex_file ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                            {item.tex_file ? 'Present' : 'Missing'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="opacity-50">PDF Status</span>
                          <span className={item.pdf_file ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                            {item.pdf_file ? 'Present' : 'Missing'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden border-border/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground font-medium">
                  <tr>
                    <th className="px-4 py-3">Lecture</th>
                    <th className="px-4 py-3">Series</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Issues</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{item.lecture_name}</div>
                        <div className="text-xs text-muted-foreground">{item.semester}{item.year}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">Series {item.number}</div>
                        <div className="text-xs text-muted-foreground truncate w-40">{item.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 text-xs font-mono">
                          <span className={item.tex_file ? 'text-green-600' : 'text-red-500'} title="TeX File">T</span>
                          <span className={item.pdf_file ? 'text-green-600' : 'text-red-500'} title="PDF File">P</span>
                          <span className={item.solution_file ? 'text-green-600' : 'text-muted-foreground'} title="Solution">S</span>
                          <span className={item.render_status === 'ok' ? 'text-green-600' : 'text-orange-500'} title="Render Status">R</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.issues.slice(0, 2).map((i) => (
                            <span key={i} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive border border-destructive/20">
                              {ISSUE_LABELS[i] || i}
                            </span>
                          ))}
                          {item.issues.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{item.issues.length - 2} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                          <a href={`/series/${item.id}`} className="text-muted-foreground hover:text-primary">
                            <span className="sr-only">Open</span>
                            →
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
