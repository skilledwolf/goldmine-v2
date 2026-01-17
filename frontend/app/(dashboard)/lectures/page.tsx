'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/lib/swr';
import { useStarredLectures } from '@/lib/stars';
import { Star, Plus, Trash2 } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { useAuth } from '@/lib/auth';
import { LectureCreateDialog } from './lecture-create-dialog';
import { apiFetch } from '@/lib/api';

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
  const { isStaff, isProfessor } = useAuth();
  const canManage = isStaff || isProfessor;

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

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this lecture? It will be moved to Trash and can be restored.')) return;

    try {
      await apiFetch(`/lectures/${id}`, { method: 'DELETE' });
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to delete lecture');
    }
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
          Lectures
        </h1>
        <p className="text-muted-foreground">Browse all available lectures and their semesters.</p>
      </div>
      <div className="flex items-center gap-4 w-full md:w-auto">
        {canManage && (
          <LectureCreateDialog
            trigger={
              <Button className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Create Lecture
              </Button>
            }
          />
        )}
        <div className="w-full md:w-96">
          <div className="relative group">
            <Input
              placeholder="Search lectures…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-4 bg-background/50 backdrop-blur-sm border-primary/20 focus-visible:ring-primary transition-all group-hover:border-primary/50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {isLoading && renderLoading()}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <span>{error instanceof Error ? error.message : 'Failed to load lectures'}</span>
          <Button variant="outline" size="sm" onClick={handleRetry} className="border-destructive/30 hover:bg-destructive/20">
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lectures.map((lecture) => (
            <Card key={lecture.id} className="group relative overflow-hidden transition-all hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 border-primary/10 h-full flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <CardHeader className="relative pb-2 flex-none">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded w-fit">
                    /{lecture.name}
                  </div>
                  <div className="flex gap-1">
                    {canManage && (
                      <button
                        type="button"
                        className="rounded-full p-2 transition-colors hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(e, lecture.id)}
                        aria-label="Delete lecture"
                        title="Delete lecture"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`rounded-full p-2 transition-colors hover:bg-muted ${isStarred(lecture.id) ? 'text-amber-500' : 'text-muted-foreground'}`}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleStar(lecture.id);
                      }}
                      aria-pressed={isStarred(lecture.id)}
                      aria-label={isStarred(lecture.id) ? 'Unstar lecture' : 'Star lecture'}
                    >
                      <Star className="h-4 w-4" fill={isStarred(lecture.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {lecture.long_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-4 flex-1 flex flex-col justify-end">
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
                    <span className="text-xs text-muted-foreground italic">No Semesters</span>
                  )}
                </div>
                <Button variant="ghost" className="w-full justify-between group/btn hover:bg-primary/10 hover:text-primary mt-auto" asChild>
                  <Link href={`/lectures/${lecture.id}`}>
                    Open Lecture
                    <span className="opacity-0 -translate-x-2 transition-all group-hover/btn:opacity-100 group-hover/btn:translate-x-0">→</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          {lectures.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center bg-muted/20 animate-in fade-in zoom-in-95 duration-300">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Star className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="text-lg font-semibold">No lectures found</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                We could not find any lectures matching {search}. Try searching for something else.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setSearch('')}>Clear Search</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
