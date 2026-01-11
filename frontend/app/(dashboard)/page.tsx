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
import { Star } from 'lucide-react';

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
  const user = me && !('message' in me) ? me : null;
  const loading = lecturesLoading || meLoading;
  const visibleLectures = useMemo(() => {
    if (showStarredOnly) {
      return lectures.filter((lecture) => starredIds.includes(lecture.id));
    }
    return lectures;
  }, [lectures, showStarredOnly, starredIds]);
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
    if (lectures.length === 0) return;
    let cancelled = false;
    const loadRecentSeries = async () => {
      setRecentSeriesLoading(true);
      try {
        const lectureIds = lectures.map((l) => l.id).slice(0, 12);
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
  }, [lectures]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {user ? user.username : 'Gold Mine User'}
          </h1>
        </div>
        <Button asChild>
          <Link href="/lectures">Browse lectures</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Lectures</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {starredIds.length > 0 && <span>{starredIds.length} starred</span>}
              <Button
                variant={showStarredOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowStarredOnly(true)}
                disabled={starredIds.length === 0}
              >
                Starred
              </Button>
              {starredIds.length > 0 && (
                <Button
                  variant={!showStarredOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowStarredOnly(false)}
                >
                  All
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {displayLectures.map((lecture) => (
              <Card key={lecture.id} className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span>{lecture.long_name}</span>
                    <button
                      type="button"
                      className={`rounded-md p-1 ${isStarred(lecture.id) ? 'text-amber-500' : 'text-muted-foreground'}`}
                      onClick={() => toggleStar(lecture.id)}
                      aria-pressed={isStarred(lecture.id)}
                      aria-label={isStarred(lecture.id) ? 'Unstar lecture' : 'Star lecture'}
                    >
                      <Star className="h-4 w-4" fill={isStarred(lecture.id) ? 'currentColor' : 'none'} />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="font-mono text-xs text-foreground">/{lecture.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {lecture.semester_groups.map((sg) => (
                      <Link
                        key={sg.id}
                        href={`/lectures/${lecture.id}?semesterGroup=${sg.id}`}
                        className="rounded-full bg-accent px-2 py-1 text-xs text-accent-foreground hover:bg-accent/70"
                      >
                        {sg.semester}{sg.year}
                      </Link>
                    ))}
                  </div>
                  <Button variant="link" className="p-0" asChild>
                    <Link href={`/lectures/${lecture.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
            {showStarredOnly && starredIds.length > 6 && (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Showing 6 of {starredIds.length} starred lectures. Switch to “All” to browse more.
                </CardContent>
              </Card>
            )}
            {visibleLectures.length === 0 && (
              <Card>
                <CardContent className="p-6 text-muted-foreground">
                  {showStarredOnly ? (
                    <>
                      <div>No starred lectures yet.</div>
                      <div className="mt-2">
                        <Button size="sm" asChild>
                          <Link href="/lectures">Browse lectures to star</Link>
                        </Button>
                      </div>
                    </>
                  ) : (
                    'No lectures yet. Add one via the admin panel.'
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Continue where you left off</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {recentItems.length === 0 && (
                <div className="text-muted-foreground">No recent items yet.</div>
              )}
              {recentItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                    )}
                  </div>
                  <Link href={item.href} className="text-sm text-primary hover:underline">
                    Open
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recently rendered</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {recentSeriesLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
              {!recentSeriesLoading && recentSeries.length === 0 && (
                <div className="text-muted-foreground">No recent series yet.</div>
              )}
              {recentSeries.map((series) => (
                <div key={series.id} className="space-y-1">
                  <div className="font-medium">
                    Series {series.number}{series.title ? ` — ${series.title}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {series.lecture_name} · {series.semester}{series.year}
                  </div>
                  <FileBadges
                    pdfFile={series.pdf_file}
                    texFile={series.tex_file}
                    solutionFile={series.solution_file}
                  />
                  <Link href={`/series/${series.id}`} className="text-sm text-primary hover:underline">
                    Open series
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
