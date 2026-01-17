'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileBadges } from '@/components/ui/file-badges';
import { useRecentItems } from '@/lib/recent';
import { useApiSWR } from '@/lib/swr';
import { useStarredLectures } from '@/lib/stars';
import { Star, BookOpen, Clock, Zap } from 'lucide-react';

type Lecture = {
  id: number;
  name: string;
  long_name: string;
  semester_groups: { id: number; year: number; semester: string }[];
};

type User = {
  id: number;
  username: string;
  email?: string;
  is_staff?: boolean;
};

type SeriesSummary = {
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
  html_rendered_at?: string | null;
};

export default function DashboardHome() {
  const [error, setError] = useState<string | null>(null);
  const [recentSeries, setRecentSeries] = useState<SeriesSummary[]>([]);
  const [recentSeriesLoading, setRecentSeriesLoading] = useState(false);
  const recentItems = useRecentItems();
  const { starredIds, isStarred, toggleStar } = useStarredLectures();
  const [showStarredOnly, setShowStarredOnly] = useState(true);
  const {
    data: lectureData,
    error: lectureError,
    isLoading: lecturesLoading,
    mutate: mutateLectures,
  } = useApiSWR<Lecture[]>('/lectures');
  const {
    data: me,
    error: meError,
    isLoading: meLoading,
    mutate: mutateMe,
  } = useApiSWR<User | { message: string }>('/auth/me');

  const lectures = useMemo(() => lectureData ?? [], [lectureData]);
  const sortedLectures = useMemo(() => {
    return lectures
      .slice()
      .sort((a, b) => {
        const aHas = a.semester_groups.length > 0;
        const bHas = b.semester_groups.length > 0;
        if (aHas !== bHas) return aHas ? -1 : 1;
        const aName = (a.long_name || a.name || '').toLowerCase();
        const bName = (b.long_name || b.name || '').toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);
        const aShort = (a.name || '').toLowerCase();
        const bShort = (b.name || '').toLowerCase();
        if (aShort !== bShort) return aShort.localeCompare(bShort);
        return a.id - b.id;
      });
  }, [lectures]);
  const user = me && !('message' in me) ? me : null;
  const loading = lecturesLoading || meLoading;
  const visibleLectures = useMemo(() => {
    if (showStarredOnly) {
      return sortedLectures.filter((lecture) => starredIds.includes(lecture.id));
    }
    return sortedLectures;
  }, [sortedLectures, showStarredOnly, starredIds]);
  const displayLectures = useMemo(() => {
    if (showStarredOnly) {
      return visibleLectures.slice(0, 6);
    }
    return visibleLectures;
  }, [showStarredOnly, visibleLectures]);

  useEffect(() => {
    if (lectureError) {
      const message = lectureError instanceof Error ? lectureError.message : 'Failed to load dashboard';
      setError(message);
      return;
    }
    if (meError) {
      const message = meError instanceof Error ? meError.message : 'Failed to load user';
      setError(message);
      return;
    }
    setError(null);
  }, [lectureError, meError]);

  useEffect(() => {
    document.title = 'Dashboard · Gold Mine V2';
  }, []);

  useEffect(() => {
    if (starredIds.length === 0 && !showStarredOnly) {
      setShowStarredOnly(true);
    }
  }, [starredIds.length, showStarredOnly]);

  useEffect(() => {
    if (sortedLectures.length === 0) return;
    let cancelled = false;
    const loadRecentSeries = async () => {
      setRecentSeriesLoading(true);
      try {
        const lectureIds = sortedLectures.map((l) => l.id).slice(0, 12);
        const seriesLists = await Promise.all(
          lectureIds.map((id) => apiFetch<SeriesSummary[]>(`/lectures/${id}/series`))
        );
        if (cancelled) return;
        const allSeries = seriesLists.flat();
        const sorted = allSeries
          .slice()
          .sort((a, b) => {
            const dateA = a.html_rendered_at ? new Date(a.html_rendered_at).getTime() : 0;
            const dateB = b.html_rendered_at ? new Date(b.html_rendered_at).getTime() : 0;
            if (dateA !== dateB) return dateB - dateA;
            return b.id - a.id;
          })
          .slice(0, 6);
        setRecentSeries(sorted);
      } catch {
        if (!cancelled) setRecentSeries([]);
      } finally {
        if (!cancelled) setRecentSeriesLoading(false);
      }
    };
    loadRecentSeries();
    return () => {
      cancelled = true;
    };
  }, [sortedLectures]);

  const handleRetry = () => {
    mutateLectures();
    mutateMe();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="h-full">
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-14" />
                </div>
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-destructive">Error: {error}</div>
        <Button onClick={handleRetry} variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Welcome back,</p>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {user ? user.username : 'Gold Mine User'}
          </h1>
        </div>
        <Button asChild className="shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95">
          <Link href="/lectures">Browse Available Lectures</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Main Content Area - Variable Width */}
        <div className="space-y-6 md:col-span-2 lg:col-span-2 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">Your Lectures</h2>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-1">
              <Button
                variant={showStarredOnly ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowStarredOnly(true)}
                disabled={starredIds.length === 0}
                className="transition-all"
              >
                Starred <span className="ml-1 text-xs opacity-70">({starredIds.length})</span>
              </Button>
              <Button
                variant={!showStarredOnly ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowStarredOnly(false)}
                className="transition-all"
              >
                All Lectures
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayLectures.map((lecture) => (
              <Card key={lecture.id} className="group relative overflow-hidden transition-all hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 border-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardHeader className="relative pb-2">
                  <div className="flex justify-between items-start mb-2">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <button
                      type="button"
                      className={`rounded-full p-2 transition-colors hover:bg-muted ${isStarred(lecture.id) ? 'text-amber-500' : 'text-muted-foreground'}`}
                      onClick={() => toggleStar(lecture.id)}
                      aria-pressed={isStarred(lecture.id)}
                      aria-label={isStarred(lecture.id) ? 'Unstar lecture' : 'Star lecture'}
                    >
                      <Star className="h-4 w-4" fill={isStarred(lecture.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <CardTitle className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">
                    {lecture.long_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative space-y-3">
                  <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded w-fit">
                    <span>/{lecture.name}</span>
                  </div>
                  <div className="h-px bg-border/50" />
                  <div className="flex flex-wrap gap-2">
                    {lecture.semester_groups.length > 0 ? (
                      lecture.semester_groups.map((sg) => (
                        <Link
                          key={sg.id}
                          href={`/lectures/${lecture.id}?semesterGroup=${sg.id}`}
                          className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          {sg.semester} {sg.year}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No Active Semesters</span>
                    )}
                  </div>
                  <Button variant="ghost" className="w-full justify-between group/btn hover:bg-primary/10 hover:text-primary" asChild>
                    <Link href={`/lectures/${lecture.id}`}>
                      View Details
                      <span className="opacity-0 -translate-x-2 transition-all group-hover/btn:opacity-100 group-hover/btn:translate-x-0">→</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}

            {showStarredOnly && starredIds.length > 6 && (
              <Card className="flex flex-col items-center justify-center p-6 text-center border-dashed bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Star className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">And {starredIds.length - 6} more...</p>
                <Button variant="link" onClick={() => setShowStarredOnly(false)}>View All</Button>
              </Card>
            )}

            {visibleLectures.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center bg-muted/20">
                <div className="rounded-full bg-muted p-4 mb-4">
                  {showStarredOnly ? <Star className="h-8 w-8 text-muted-foreground" /> : <BookOpen className="h-8 w-8 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-semibold">{showStarredOnly ? 'No Starred Lectures' : 'No Lectures Available'}</h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                  {showStarredOnly
                    ? 'Star lectures to have quick access to them here.'
                    : 'It looks like there are no lectures in the system yet.'}
                </p>
                {showStarredOnly && (
                  <Button variant="outline" className="mt-4" onClick={() => setShowStarredOnly(false)}>Browse All</Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-6">
          <Card className="border-secondary overflow-hidden">
            <CardHeader className="bg-secondary/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Jump Back In
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {recentItems.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No recently viewed items.
                  </div>
                ) : (
                  recentItems.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      href={item.href}
                      className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50 group"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate group-hover:text-primary transition-colors">{item.title}</div>
                        {item.subtitle && (
                          <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                        )}
                      </div>
                      <div className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all">
                        →
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Just Updated
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {recentSeriesLoading ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : recentSeries.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No recent updates.
                  </div>
                ) : (
                  recentSeries.map((series) => (
                    <div key={series.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <Link href={`/series/${series.id}`} className="font-medium hover:text-primary hover:underline line-clamp-1">
                          Series {series.number}{series.title ? ` — ${series.title}` : ''}
                        </Link>
                        <span className="text-[10px] uppercase tracking-wider font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">New</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {series.lecture_name} · {series.semester} {series.year}
                      </div>
                      <FileBadges
                        pdfFile={series.pdf_file}
                        texFile={series.tex_file}
                        solutionFile={series.solution_file}
                      />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
