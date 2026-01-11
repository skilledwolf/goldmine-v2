'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, getApiBase } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileBadges } from '@/components/ui/file-badges';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';

type LectureList = {
  id: number;
  name: string;
  long_name: string;
  semester_groups: { id: number; year: number; semester: string }[];
};

type Series = {
  id: number;
  number: number;
  title: string;
  tex_file: string;
  pdf_file: string;
  solution_file: string;
  lecture_name: string;
  semester: string;
  year: number;
  lecture_id: number;
  exercises: Exercise[];
};

type Exercise = {
  id: number;
  number: number;
  title: string;
  text_content: string;
  series_id: number;
  series_number: number;
  lecture_id: number;
  lecture_name: string;
  semester: string;
  year: number;
};

type SearchResponse = {
  lectures: LectureList[];
  series: Series[];
  exercises: Exercise[];
};

type SearchParams = {
  q: string;
  lectureId: string;
  year: string;
  semester: string;
  professor: string;
};

type SavedSearch = {
  id: string;
  name: string;
  params: SearchParams;
};

export default function SearchPage() {
  const [lectures, setLectures] = useState<LectureList[]>([]);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'lectures' | 'series' | 'exercises'>('lectures');
  const [hasSearched, setHasSearched] = useState(false);
  const [autoSearch, setAutoSearch] = useState(true);
  const [sort, setSort] = useState<'relevance' | 'year-desc' | 'year-asc' | 'number-asc' | 'number-desc' | 'title-asc'>('relevance');
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveName, setSaveName] = useState('');

  const [q, setQ] = useState('');
  const [lectureId, setLectureId] = useState<string>('all');
  const [year, setYear] = useState<string>('');
  const [semester, setSemester] = useState<string>('any');
  const [professor, setProfessor] = useState<string>('');
  const debouncedQ = useDebouncedValue(q, 350);

  useEffect(() => {
    apiFetch<LectureList[]>('/lectures').then(setLectures).catch(() => setLectures([]));
  }, []);

  useEffect(() => {
    document.title = 'Search · Gold Mine V2';
  }, []);

  const searchCrumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'Search', href: '/search', isCurrent: true },
    ],
    []
  );
  useBreadcrumbs(searchCrumbs);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('gm_saved_searches_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedSearch[];
      if (Array.isArray(parsed)) setSavedSearches(parsed);
    } catch {
      setSavedSearches([]);
    }
  }, []);

  const persistSaved = useCallback((next: SavedSearch[]) => {
    setSavedSearches(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('gm_saved_searches_v1', JSON.stringify(next));
    }
  }, []);

  const currentParams = useMemo<SearchParams>(() => ({
    q,
    lectureId,
    year,
    semester,
    professor,
  }), [q, lectureId, year, semester, professor]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    lectures.forEach((l) => l.semester_groups.forEach((sg) => ys.add(sg.year)));
    return Array.from(ys).sort((a, b) => b - a);
  }, [lectures]);

  const executeSearch = useCallback(async (params: SearchParams) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    const query: Record<string, string> = {};
    if (params.q) query.q = params.q;
    if (params.lectureId !== 'all') query.lecture_id = params.lectureId;
    if (params.year) query.year = params.year;
    if (params.semester !== 'any') query.semester = params.semester;
    if (params.professor) query.professor = params.professor;
    try {
      const data = await apiFetch<SearchResponse>('/search', { params: query });
      setResults(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch(currentParams);
  };

  useEffect(() => {
    if (!autoSearch) return;
    const params = { ...currentParams, q: debouncedQ };
    const hasFilters = Boolean(
      params.q ||
      params.lectureId !== 'all' ||
      params.year ||
      params.semester !== 'any' ||
      params.professor
    );
    if (!hasFilters) return;
    executeSearch(params);
  }, [autoSearch, currentParams, debouncedQ, executeSearch]);

  const apiBase = getApiBase();

  const renderLoading = () => (
    <Card>
      <CardHeader>
        <CardTitle>Searching…</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const handleSaveSearch = () => {
    if (!saveName.trim()) return;
    const entry: SavedSearch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: saveName.trim(),
      params: currentParams,
    };
    persistSaved([entry, ...savedSearches]);
    setSaveName('');
  };

  const applySavedSearch = (entry: SavedSearch) => {
    setQ(entry.params.q);
    setLectureId(entry.params.lectureId);
    setYear(entry.params.year);
    setSemester(entry.params.semester);
    setProfessor(entry.params.professor);
    executeSearch(entry.params);
  };

  const removeSavedSearch = (id: string) => {
    persistSaved(savedSearches.filter((entry) => entry.id !== id));
  };

  const highlightText = (text: string) => {
    if (!q.trim()) return text;
    const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (terms.length === 0) return text;
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      idx % 2 === 1 ? (
        <mark key={`${part}-${idx}`} className="rounded bg-primary/15 px-1 text-foreground">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      )
    );
  };

  const sortedResults = useMemo(() => {
    if (!results) return null;
    const sortLectures = (list: LectureList[]) => {
      if (sort === 'title-asc') {
        return list.slice().sort((a, b) => a.long_name.localeCompare(b.long_name));
      }
      return list;
    };
    const sortSeries = (list: Series[]) => {
      const clone = list.slice();
      switch (sort) {
        case 'year-desc':
          return clone.sort((a, b) => b.year - a.year || b.number - a.number);
        case 'year-asc':
          return clone.sort((a, b) => a.year - b.year || a.number - b.number);
        case 'number-asc':
          return clone.sort((a, b) => a.number - b.number);
        case 'number-desc':
          return clone.sort((a, b) => b.number - a.number);
        case 'title-asc':
          return clone.sort((a, b) => a.title.localeCompare(b.title));
        default:
          return list;
      }
    };
    const sortExercises = (list: Exercise[]) => {
      const clone = list.slice();
      switch (sort) {
        case 'year-desc':
          return clone.sort((a, b) => b.year - a.year || b.series_number - a.series_number || b.number - a.number);
        case 'year-asc':
          return clone.sort((a, b) => a.year - b.year || a.series_number - b.series_number || a.number - b.number);
        case 'number-asc':
          return clone.sort((a, b) => a.series_number - b.series_number || a.number - b.number);
        case 'number-desc':
          return clone.sort((a, b) => b.series_number - a.series_number || b.number - a.number);
        case 'title-asc':
          return clone.sort((a, b) => a.title.localeCompare(b.title));
        default:
          return list;
      }
    };
    return {
      lectures: sortLectures(results.lectures),
      series: sortSeries(results.series),
      exercises: sortExercises(results.exercises),
    };
  }, [results, sort]);

  const activeFilters = useMemo(() => {
    const filters: { label: string; onClear: () => void }[] = [];
    if (lectureId !== 'all') {
      const lecture = lectures.find((l) => String(l.id) === lectureId);
      filters.push({
        label: `Lecture: ${lecture ? lecture.name : lectureId}`,
        onClear: () => setLectureId('all'),
      });
    }
    if (year) {
      filters.push({ label: `Year: ${year}`, onClear: () => setYear('') });
    }
    if (semester !== 'any') {
      filters.push({ label: `Semester: ${semester}`, onClear: () => setSemester('any') });
    }
    if (professor) {
      filters.push({ label: `Professor: ${professor}`, onClear: () => setProfessor('') });
    }
    if (q) {
      filters.push({ label: `Query: ${q}`, onClear: () => setQ('') });
    }
    return filters;
  }, [lectureId, year, semester, professor, q, lectures]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search</h1>
          <p className="text-sm text-muted-foreground">Find lectures, series, or exercises.</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-5 md:items-end">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-foreground">Query</label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. QM1, Fourier, HS2020"
            list="lecture-suggestions"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Lecture</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={lectureId}
            onChange={(e) => setLectureId(e.target.value)}
          >
            <option value="all">All lectures</option>
            {lectures.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name} — {l.long_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Year</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={year || 'any'}
            onChange={(e) => setYear(e.target.value === 'any' ? '' : e.target.value)}
          >
            <option value="any">Any year</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Semester</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="any">Any</option>
            <option value="HS">HS</option>
            <option value="FS">FS</option>
          </select>
        </div>
        <div className="md:col-span-5 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div>
            <label className="text-sm font-medium text-foreground">Professor (optional)</label>
            <Input
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              placeholder="e.g. Beisert"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={autoSearch}
              onChange={(e) => setAutoSearch(e.target.checked)}
            />
            Auto-search
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </form>

      <datalist id="lecture-suggestions">
        {lectures.map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {activeFilters.map((filter, idx) => (
            <button
              key={`${filter.label}-${idx}`}
              type="button"
              className="rounded-full border border-input bg-background px-2 py-1 text-muted-foreground hover:text-foreground"
              onClick={filter.onClear}
            >
              {filter.label} ✕
            </button>
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <div className="text-sm font-semibold">Saved searches</div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this search"
            className="max-w-xs"
          />
          <Button type="button" variant="secondary" onClick={handleSaveSearch}>
            Save current
          </Button>
        </div>
        {savedSearches.length === 0 && (
          <div className="text-xs text-muted-foreground">No saved searches yet.</div>
        )}
        {savedSearches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => applySavedSearch(entry)}
                >
                  {entry.name}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeSavedSearch(entry.id)}
                  aria-label={`Remove saved search ${entry.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="text-destructive">{error}</div>}

      {loading && renderLoading()}

      {!loading && !results && hasSearched && !error && (
        <div className="text-sm text-muted-foreground">No results yet. Adjust filters and search again.</div>
      )}

      {!loading && sortedResults && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['lectures', 'series', 'exercises'] as const).map((t) => {
              const counts = {
                lectures: sortedResults.lectures.length,
                series: sortedResults.series.length,
                exercises: sortedResults.exercises.length,
              };
              return (
                <Button
                  key={t}
                  variant={tab === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
                </Button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sort</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="relevance">Relevance</option>
                <option value="year-desc">Year (newest)</option>
                <option value="year-asc">Year (oldest)</option>
                <option value="number-asc">Number (asc)</option>
                <option value="number-desc">Number (desc)</option>
                <option value="title-asc">Title (A–Z)</option>
              </select>
            </div>
          </div>

          {tab === 'lectures' && (
            <Card>
              <CardHeader>
                <CardTitle>Lectures ({sortedResults.lectures.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedResults.lectures.length === 0 && <div className="text-sm text-muted-foreground">No lecture matches.</div>}
                {sortedResults.lectures.map((lec) => (
                  <div key={lec.id} className="flex items-center justify-between border-b last:border-none pb-2 last:pb-0">
                    <div>
                      <div className="font-medium">{highlightText(lec.long_name)}</div>
                      <div className="text-xs text-muted-foreground">/{lec.name}</div>
                    </div>
                    <Link href={`/lectures/${lec.id}`} className="text-sm text-primary hover:underline">Open</Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tab === 'series' && (
            <Card>
              <CardHeader>
                <CardTitle>Series ({sortedResults.series.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedResults.series.length === 0 && <div className="text-sm text-muted-foreground">No series matches.</div>}
                {sortedResults.series.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border-b last:border-none pb-2 last:pb-0 gap-3">
                    <div className="space-y-1">
                      <div className="font-medium leading-tight">
                        Series {s.number}
                        {s.title && <> — {highlightText(s.title)}</>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.lecture_name} · {s.semester}{s.year}
                      </div>
                      <FileBadges
                        pdfFile={s.pdf_file}
                        texFile={s.tex_file}
                        solutionFile={s.solution_file}
                      />
                      <div className="flex gap-3 text-sm">
                        <Link href={`/series/${s.id}`} className="text-primary hover:underline">Open</Link>
                        {s.solution_file && (
                          <a
                            href={`${apiBase}/files/${s.id}/solution`}
                            className="text-primary hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Solutions
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tab === 'exercises' && (
            <Card>
              <CardHeader>
                <CardTitle>Exercises ({sortedResults.exercises.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedResults.exercises.length === 0 && <div className="text-sm text-muted-foreground">No exercise matches.</div>}
                {sortedResults.exercises.map((ex) => (
                  <div key={ex.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Ex {ex.number}: {ex.title ? highlightText(ex.title) : 'Untitled'}</div>
                      <div className="text-xs text-muted-foreground">
                        {ex.lecture_name} · {ex.semester}{ex.year} · Series {ex.series_number}
                      </div>
                    </div>
                    {ex.text_content && (
                      <p className="mt-2 text-sm text-foreground/90 line-clamp-3">{highlightText(ex.text_content)}</p>
                    )}
                    <div className="mt-2 flex gap-3 text-sm">
                      <Link href={`/series/${ex.series_id}`} className="text-primary hover:underline">
                        Go to series
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
