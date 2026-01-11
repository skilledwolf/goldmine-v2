'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/lib/swr';
import { useStarredLectures } from '@/lib/stars';
import { Star } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';

type Lecture = {
  id: number;
  name: string;
  long_name: string;
  semester_groups: { id: number; year: number; semester: string }[];
};

export default function LecturesPage() {
  const [search, setSearch] = useState('');
  const endpoint = search ? `/lectures?q=${encodeURIComponent(search)}` : '/lectures';
  const {
    data: lectureData,
    error,
    isLoading,
    mutate,
  } = useApiSWR<Lecture[]>(endpoint);
  const lectures = lectureData ?? [];
  const { isStarred, toggleStar } = useStarredLectures();

  useEffect(() => {
    document.title = 'Lectures · Gold Mine V2';
  }, []);

  const lectureCrumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'Lectures', href: '/lectures', isCurrent: true },
    ],
    []
  );
  useBreadcrumbs(lectureCrumbs);

  const handleRetry = () => {
    mutate();
  };

  const renderLoading = () => (
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
              <Skeleton className="h-6 w-12" />
            </div>
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lectures</h1>
          <p className="text-sm text-muted-foreground">Browse available lectures and semesters.</p>
        </div>
        <div className="w-72">
          <Input
            placeholder="Search lectures…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && renderLoading()}
      {error && (
        <div className="space-y-2">
          <div className="text-destructive">{error}</div>
          <button
            type="button"
            className="text-primary text-sm underline"
            onClick={handleRetry}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lectures.map((lecture) => (
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
                  <Link
                    href={`/lectures/${lecture.id}`}
                    className="inline-flex items-center rounded-md border border-input px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    Open lecture →
                  </Link>
                </CardContent>
              </Card>
            ))}
          {lectures.length === 0 && (
            <Card>
              <CardContent className="p-6 text-muted-foreground">
                No lectures match your search.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
