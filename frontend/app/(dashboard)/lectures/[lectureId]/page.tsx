'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getApiBase } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { addRecentItem } from '@/lib/recent';
import { useApiSWR } from '@/lib/swr';
import { useStarredLectures } from '@/lib/stars';
import { Star } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';

type Exercise = {
  id: number;
  number: number;
  title: string;
};

type Series = {
  id: number;
  number: number;
  title: string;
  tex_file: string;
  pdf_file: string;
  solution_file: string;
  exercises: Exercise[];
  lecture_name: string;
  semester: string;
  year: number;
  lecture_id: number;
};

type SemesterGroup = {
  id: number;
  year: number;
  semester: string;
  professors: string;
  series: Series[];
};

type Lecture = {
  id: number;
  name: string;
  long_name: string;
  semester_groups: SemesterGroup[];
};

export default function LectureDetailPage() {
  const params = useParams();
  const lectureId = params?.lectureId as string;
  const searchParams = useSearchParams();
  const apiBase = getApiBase();

  const { data: lecture, error, isLoading } = useApiSWR<Lecture>(
    lectureId ? `/lectures/${lectureId}` : null
  );
  const errorMessage = error instanceof Error ? error.message : error ? 'Failed to load lecture' : null;
  const [activeGroupId, setActiveGroupId] = useState<string>(() => searchParams.get('semesterGroup') || 'all');
  const { isStarred, toggleStar } = useStarredLectures();
  const lectureCrumbs = useMemo(() => {
    if (!lecture) return null;
    return [
      { label: 'Dashboard', href: '/' },
      { label: 'Lectures', href: '/lectures' },
      { label: lecture.long_name, href: `/lectures/${lecture.id}`, isCurrent: true },
    ];
  }, [lecture]);

  useBreadcrumbs(lectureCrumbs);

  useEffect(() => {
    if (!lecture) return;
    document.title = `${lecture.long_name} · Gold Mine V2`;
    addRecentItem({
      type: 'lecture',
      id: lecture.id,
      title: lecture.long_name,
      subtitle: `/${lecture.name}`,
      href: `/lectures/${lecture.id}`,
    });
  }, [lecture]);

  const effectiveGroupId = useMemo(() => {
    if (!lecture) return activeGroupId;
    if (activeGroupId === 'all') return 'all';
    const id = Number(activeGroupId);
    return lecture.semester_groups.some((sg) => sg.id === id) ? activeGroupId : 'all';
  }, [lecture, activeGroupId]);

  const filteredGroups = useMemo(() => {
    if (!lecture) return [];
    if (effectiveGroupId === 'all') return lecture.semester_groups;
    const id = Number(effectiveGroupId);
    return lecture.semester_groups.filter((sg) => sg.id === id);
  }, [lecture, effectiveGroupId]);

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading lecture…</div>;
  if (errorMessage) return <div className="p-4 text-destructive">{errorMessage}</div>;
  if (!lecture) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`rounded-md p-1 ${lecture && isStarred(lecture.id) ? 'text-amber-500' : 'text-muted-foreground'}`}
            onClick={() => lecture && toggleStar(lecture.id)}
            aria-pressed={lecture ? isStarred(lecture.id) : false}
            aria-label={lecture && isStarred(lecture.id) ? 'Unstar lecture' : 'Star lecture'}
          >
            <Star className="h-5 w-5" fill={lecture && isStarred(lecture.id) ? 'currentColor' : 'none'} />
          </button>
          <div>
          <p className="text-sm text-muted-foreground">Lecture</p>
          <h1 className="text-3xl font-bold tracking-tight">{lecture.long_name}</h1>
          </div>
        </div>
        <Link href="/lectures" className="text-sm text-primary hover:underline">
          ← Back to lectures
        </Link>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">Semester:</span>
          <button
            type="button"
            className={`rounded-md border px-2 py-1 ${effectiveGroupId === 'all' ? 'border-primary/50 text-primary' : 'border-input'}`}
            onClick={() => setActiveGroupId('all')}
          >
            All
          </button>
          {lecture.semester_groups.map((sg) => (
            <button
              key={sg.id}
              type="button"
              className={`rounded-md border px-2 py-1 ${effectiveGroupId === String(sg.id) ? 'border-primary/50 text-primary' : 'border-input'}`}
              onClick={() => setActiveGroupId(String(sg.id))}
            >
              {sg.semester}{sg.year}
            </button>
          ))}
        </div>

        <div className="grid gap-4">
        {filteredGroups.map((sg) => (
          <Card key={sg.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{lecture.name} {sg.semester}{sg.year}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Professors: {sg.professors || 'n/a'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sg.series.length === 0 && (
                <div className="text-sm text-muted-foreground">No series yet.</div>
              )}
              {sg.series.map((series) => (
                <div
                  key={series.id}
                  className="rounded-md border p-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm uppercase tracking-wide text-muted-foreground">
                        Series {series.number}
                        {series.title ? ` — ${series.title}` : ''}
                        {` (${series.exercises.length} exercises)`}
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                        {series.exercises.slice(0, 6).map((ex) => (
                          <li key={ex.id} className="flex gap-2">
                            <span className="text-muted-foreground">Ex {ex.number}:</span>
                            <span>{ex.title || 'Untitled'}</span>
                          </li>
                        ))}
                      </ul>
                      {series.exercises.length > 6 && (
                        <div className="text-xs text-muted-foreground">
                          +{series.exercises.length - 6} more exercises
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link href={`/series/${series.id}`}>Open series</Link>
                      </Button>
                      {series.solution_file && (
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={`${apiBase}/files/${series.id}/solution`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Solutions
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        </div>
      </div>
    </div>
  );
}
