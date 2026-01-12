'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search as SearchIcon, User, X, Save, BookOpen, Eye, ArrowRight } from 'lucide-react';
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
  series_id: number;
  series_number: number;
  lecture_id: number;
  lecture_name: string;
  semester: string;
  year: number;
  snippet_html?: string;
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">Search</h1>
          <p className="text-muted-foreground">Find lectures, series, or specific exercises across Gold Mine.</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/10 bg-card/50 backdrop-blur-sm shadow-sm md:p-6 p-4">
        <form onSubmit={handleSearch} className="grid gap-6 md:grid-cols-5 md:items-end">
          <div className="md:col-span-2 space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Query</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. QM1, Fourier, HS2020"
                list="lecture-suggestions"
                className="pl-9 bg-background/50 border-primary/20 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Lecture</label>
            <select
              className="flex h-10 w-full rounded-md border border-primary/20 bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={lectureId}
              onChange={(e) => setLectureId(e.target.value)}
            >
              <option value="all">All lectures</option>
              {lectures.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Year</label>
            <select
              className="flex h-10 w-full rounded-md border border-primary/20 bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Semester</label>
            <select
              className="flex h-10 w-full rounded-md border border-primary/20 bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            >
              <option value="any">Any</option>
              <option value="HS">HS</option>
              <option value="FS">FS</option>
            </select>
          </div>

          <div className="md:col-span-5 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end pt-2 border-t border-border/50">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Professor (optional)</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={professor}
                  onChange={(e) => setProfessor(e.target.value)}
                  placeholder="e.g. Beisert"
                  className="pl-9 bg-background/50 border-primary/20"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 pb-2">
              <input
                type="checkbox"
                id="auto-search"
                className="h-4 w-4 rounded border-primary/20 text-primary focus:ring-primary"
                checked={autoSearch}
                onChange={(e) => setAutoSearch(e.target.checked)}
              />
              <label
                htmlFor="auto-search"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Auto-search
              </label>
            </div>
            <Button type="submit" disabled={loading} className="w-full md:w-auto shadow-md shadow-primary/20">
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>
      </div>

      <datalist id="lecture-suggestions">
        {lectures.map((l) => (
          <option key={l.id} value={l.name} />
        ))}
      </datalist>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs animate-in slide-in-from-left-2 fade-in">
          {activeFilters.map((filter, idx) => (
            <button
              key={`${filter.label}-${idx}`}
              type="button"
              className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary hover:bg-primary/10 transition-colors"
              onClick={filter.onClear}
            >
              {filter.label} <X className="ml-1.5 h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Save className="h-4 w-4" />
          Saved searches
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {savedSearches.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">You haven't saved any searches yet.</div>
          ) : (
            savedSearches.map((entry) => (
              <div key={entry.id} className="group flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs shadow-sm hover:shadow-md transition-all">
                <button
                  type="button"
                  className="text-foreground hover:text-primary font-medium"
                  onClick={() => applySavedSearch(entry)}
                >
                  {entry.name}
                </button>
                <div className="h-3 w-px bg-border mx-1" />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeSavedSearch(entry.id)}
                  aria-label={`Remove saved search ${entry.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
          <div className="h-4 w-px bg-border mx-2 hidden md:block" />
          <div className="flex items-center gap-2 flex-1 md:flex-none">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Name this search"
              className="h-8 w-40 text-xs bg-background"
            />
            <Button type="button" variant="ghost" size="sm" onClick={handleSaveSearch} disabled={!saveName.trim()}>
              Save
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {loading && renderLoading()}

      {!loading && !results && hasSearched && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted/50 p-4 mb-4">
            <SearchIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No results found. Try adjusting your filters.</p>
        </div>
      )}

      {!loading && sortedResults && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
            <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
              {(['lectures', 'series', 'exercises'] as const).map((t) => {
                const counts = {
                  lectures: sortedResults.lectures.length,
                  series: sortedResults.series.length,
                  exercises: sortedResults.exercises.length,
                };
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`
                        relative rounded-md px-3 py-1.5 text-sm font-medium transition-all
                        ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {counts[t]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Sort by:</span>
              <select
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm font-medium text-foreground focus:ring-0"
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedResults.lectures.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No lecture matches found.</div>}
              {sortedResults.lectures.map((lec) => (
                <Link key={lec.id} href={`/lectures/${lec.id}`}>
                  <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all group">
                    <CardHeader>
                      <CardTitle className=" text-lg group-hover:text-primary transition-colors flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                        {highlightText(lec.long_name)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded w-fit">/{lec.name}</div>
                      <div className="mt-4 flex items-center text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        View Details <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {tab === 'series' && (
            <div className="grid gap-4">
              {sortedResults.series.length === 0 && <div className="text-center py-12 text-muted-foreground">No series matches found.</div>}
              {sortedResults.series.map((s) => (
                <div key={s.id} className="group flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border p-4 hover:border-primary/50 hover:bg-muted/10 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">Series {s.number}</span>
                      {s.title && <span className="text-muted-foreground">— {highlightText(s.title)}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{s.lecture_name}</span>
                      <span>•</span>
                      <span>{s.semester}{s.year}</span>
                    </div>
                    <div className="pt-2">
                      <FileBadges
                        pdfFile={s.pdf_file}
                        texFile={s.tex_file}
                        solutionFile={s.solution_file}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.solution_file && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`${apiBase}/files/${s.id}/solution`}
                          target="_blank"
                          rel="noreferrer"
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" /> Solutions
                        </a>
                      </Button>
                    )}
                    <Button size="sm" asChild className="gap-2 shadow-sm">
                      <Link href={`/series/${s.id}`}>
                        Open Series <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'exercises' && (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedResults.exercises.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No exercise matches found.</div>}
              {sortedResults.exercises.map((ex) => (
                <Card key={ex.id} className="hover:border-primary/50 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base font-semibold">
                          Exercise {ex.number}: {ex.title ? highlightText(ex.title) : <span className="italic text-muted-foreground">Untitled</span>}
                        </CardTitle>
                        <div className="text-xs text-muted-foreground">
                          {ex.lecture_name} · {ex.semester}{ex.year} · Series {ex.series_number}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {ex.snippet_html && (
                      <div
                        className="text-sm text-muted-foreground line-clamp-2 bg-muted/20 p-3 rounded-md italic"
                        dangerouslySetInnerHTML={{ __html: ex.snippet_html }}
                      />
                    )}
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href={`/series/${ex.series_id}`}>
                        Go to Series
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
