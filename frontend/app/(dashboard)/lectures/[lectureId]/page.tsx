'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getApiBase, apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { addRecentItem } from '@/lib/recent';
import { useApiSWR } from '@/lib/swr';
import { useStarredLectures } from '@/lib/stars';
import { Star, FileCheck, Upload, Pencil, Plus, Trash2 } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { SheetUploadDialog } from './sheet-upload-dialog';
import { useAuth } from '@/lib/auth';
import { SemesterCreateDialog } from './semester-create-dialog';
import { mutate } from 'swr';

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
  fs_path?: string;
  can_edit?: boolean;
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
  const lectureKey = lectureId ? `/lectures/${lectureId}` : null;
  const errorMessage = error instanceof Error ? error.message : error ? 'Failed to load lecture' : null;
  const [activeGroupId, setActiveGroupId] = useState<string>(() => searchParams.get('semesterGroup') || 'all');
  const { isStarred, toggleStar } = useStarredLectures();

  const { isStaff, isProfessor } = useAuth();
  const canManageGlobal = isStaff || isProfessor;

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

  const handleDeleteSemester = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this semester group? It will be moved to Trash and can be restored.')) return;

    try {
      await apiFetch(`/semester_groups/${id}`, { method: 'DELETE' });
      if (lectureKey) mutate(lectureKey);
    } catch (err: any) {
      alert(err.message || 'Failed to delete semester group');
    }
  };

  const handleDeleteSeries = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this series? It will be moved to Trash and can be restored.')) return;

    try {
      await apiFetch(`/series-mgmt/series/${id}`, { method: 'DELETE' });
      if (lectureKey) mutate(lectureKey);
    } catch (err: any) {
      alert(err.message || 'Failed to delete series');
    }
  };

  const getNextSeriesNumber = (series: Series[]) => {
    if (!series || series.length === 0) return 1;
    return Math.max(...series.map(s => s.number)) + 1;
  };

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading lecture…</div>;
  if (errorMessage) return <div className="p-4 text-destructive">{errorMessage}</div>;
  if (!lecture) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-6">
        <div className="flex items-start gap-4">
          <button
            type="button"
            className={`mt-1 rounded-full p-2 transition-all hover:bg-muted group ${lecture && isStarred(lecture.id) ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground'}`}
            onClick={() => lecture && toggleStar(lecture.id)}
            aria-pressed={lecture ? isStarred(lecture.id) : false}
            aria-label={lecture && isStarred(lecture.id) ? 'Unstar lecture' : 'Star lecture'}
          >
            <Star className={`h-6 w-6 transition-transform group-hover:scale-110 ${lecture && isStarred(lecture.id) ? 'fill-current' : ''}`} />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
              <span>Lecture</span>
              <span>/</span>
              <span className="text-foreground">{lecture.name}</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              {lecture.long_name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManageGlobal && (
            <SemesterCreateDialog
              lectureId={lecture.id}
              trigger={
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> Add Semester
                </Button>
              }
            />
          )}
          <Button variant="ghost" className="self-start md:self-center gap-2 text-muted-foreground hover:text-primary" asChild>
            <Link href="/lectures">
              <span className="text-lg">←</span> Back to lectures
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 p-1">
          <span className="text-sm font-medium text-muted-foreground mr-2">Semester:</span>
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${effectiveGroupId === 'all'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            onClick={() => setActiveGroupId('all')}
          >
            All
          </button>
          {lecture.semester_groups.map((sg) => (
            <button
              key={sg.id}
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${effectiveGroupId === String(sg.id)
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              onClick={() => setActiveGroupId(String(sg.id))}
            >
              {sg.semester}{sg.year}
            </button>
          ))}
        </div>

        <div className="grid gap-8">
          {filteredGroups.map((sg) => (
            <div key={sg.id} className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 fade-in fill-mode-backwards" style={{ animationDelay: '100ms' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/10 bg-primary/5 p-4 backdrop-blur-sm">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    {sg.semester} {sg.year}
                    <span className="text-sm font-normal text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md border border-border/50">
                      {lecture.name}
                    </span>
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium text-foreground/80">Professors:</span> {sg.professors || 'n/a'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sg.can_edit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteSemester(e, sg.id)}
                      title="Delete Semester"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {sg.can_edit && (
                    <SheetUploadDialog
                      semesterGroupId={sg.id}
                      lectureId={lecture.id}
                      initialNumber={getNextSeriesNumber(sg.series)}
                      mode="create"
                      trigger={
                        <Button size="sm" variant="default" className="shadow-sm gap-2">
                          <Plus className="h-4 w-4" /> Add Sheet {getNextSeriesNumber(sg.series)}
                        </Button>
                      }
                    />
                  )}
                  <Button size="sm" variant="outline" className="shadow-sm" asChild>
                    <a
                      href={`${apiBase}/files/semester/${sg.id}/zip`}
                      target="_blank"
                      rel="noreferrer"
                      className="gap-2"
                    >
                      <span className="text-primary">↓</span> Download ZIP
                    </a>
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sg.series.length === 0 && (
                  <div className="col-span-full py-8 text-center text-muted-foreground italic border border-dashed rounded-xl">
                    No series available for this semester yet.
                  </div>
                )}
                {sg.series.map((series) => (
                  <div
                    key={series.id}
                    className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 transition-all hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/50"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between h-5">
                        {series.title ? (
                          <span className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Series {series.number}
                          </span>
                        ) : (
                          <span />
                        )}
                        {series.solution_file && (
                          <span className="flex h-2 w-2 rounded-full bg-green-500 ring-2 ring-green-500/20" title="Solutions available" />
                        )}
                        {sg.can_edit && (
                          <div className="flex items-center gap-1">
                            <SheetUploadDialog
                              semesterGroupId={sg.id}
                              lectureId={lecture.id}
                              seriesId={series.id}
                              initialNumber={series.number}
                              initialTitle={series.title}
                              mode="replace"
                              trigger={
                                <button className="text-muted-foreground hover:text-primary transition-colors p-1">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              }
                            />
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              title="Delete series"
                              aria-label="Delete series"
                              onClick={(e) => handleDeleteSeries(e, series.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
                        {series.title || `Series ${series.number}`}
                      </h3>

                      {series.exercises.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-1">{series.exercises.length} Exercises</p>
                          <ul className="space-y-1">
                            {series.exercises.slice(0, 4).map((ex) => (
                              <li key={ex.id} className="text-sm text-foreground/80 truncate flex items-center gap-1.5">
                                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                                <span className="font-medium">Ex {ex.number}:</span>
                                <span className="truncate opacity-80">{ex.title || 'Untitled'}</span>
                              </li>
                            ))}
                          </ul>
                          {series.exercises.length > 4 && (
                            <p className="text-xs text-muted-foreground mt-1 pl-2.5">
                              +{series.exercises.length - 4} more...
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No exercises listed.</p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center gap-2 pt-4 border-t border-border/50">
                      <Button size="sm" className="flex-1 shadow-sm group-hover:bg-primary/90" asChild>
                        <Link href={`/series/${series.id}`}>Open Series</Link>
                      </Button>
                      {series.solution_file && (
                        <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-green-600 hover:bg-green-500/10" title="View Solutions" asChild>
                          <a
                            href={`${apiBase}/files/${series.id}/solution`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileCheck className="h-5 w-5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
