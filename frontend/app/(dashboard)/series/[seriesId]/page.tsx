'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, getApiBase } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MathJaxHTML } from '@/components/html/mathjax';
import { PdfPreview } from '@/components/ui/pdf-preview';
import { addRecentItem } from '@/lib/recent';
import { useToast } from '@/components/ui/toast';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { MessageCircle, Edit2, Trash2, Reply, ChevronDown, ChevronRight, User, CornerDownRight, Send } from 'lucide-react';

type Exercise = {
  id: number;
  number: number;
  title: string;
  text_content: string;
};

type Comment = {
  id: number;
  user_id: number;
  exercise_id: number;
  text: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_username?: string | null;
  deleted_message: string;
  username?: string;
  parent_id?: number | null;
  parent_username?: string | null;
  parent_excerpt?: string | null;
  parent_created_at?: string | null;
};

type Series = {
  id: number;
  number: number;
  title: string;
  tex_file: string;
  pdf_file: string;
  solution_file: string;
  html_content?: string;
  html_rendered_at?: string | null;
  render_status?: string | null;
  render_log?: string;
  exercises: Exercise[];
  lecture_name: string;
  semester: string;
  year: number;
  lecture_id: number;
};

type PreviewTab = 'html' | 'pdf' | 'solution' | 'tex';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const highlightLatex = (value: string) => {
  const placeholders: string[] = [];
  let text = escapeHtml(value);

  text = text.replace(/(^|[^\\])(%[^\n]*)/gm, (_match, prefix, comment) => {
    const idx = placeholders.length;
    placeholders.push(`<span class="tex-comment">${comment}</span>`);
    return `${prefix}@@COMMENT_${idx}@@`;
  });

  text = text.replace(/\\[a-zA-Z@]+\*?|\\./g, (cmd) => `<span class="tex-command">${cmd}</span>`);
  text = text.replace(/[{}]/g, (brace) => `<span class="tex-brace">${brace}</span>`);

  text = text.replace(/@@COMMENT_(\d+)@@/g, (_match, idx) => placeholders[Number(idx)] || _match);

  return text;
};

function SeriesPreviewTabs({
  series,
  currentUser,
  exerciseHtmlMap = {},
  renderCommentsForExercise,
}: {
  series: Series;
  currentUser: { id: number; username: string; is_staff?: boolean } | null;
  exerciseHtmlMap?: Record<number, string>;
  renderCommentsForExercise?: (ex: Exercise, context?: 'list' | 'preview') => React.ReactNode;
}) {
  const isStaff = !!currentUser?.is_staff;
  const base = getApiBase().replace(/\/$/, '');

  const htmlContent = series.html_content || '';
  const htmlLooksLikeTexFallback = htmlContent.trimStart().startsWith('<pre>');
  const canShowHtmlPreview = series.render_status === 'ok' && !!series.html_content && !htmlLooksLikeTexFallback;

  const hasPdf = !!series.pdf_file?.trim();
  const hasSolution = !!series.solution_file?.trim();
  const hasTex = !!series.tex_file?.trim();
  const texFile = series.tex_file || '';

  const [tab, setTab] = useState<PreviewTab>(() => {
    if (canShowHtmlPreview) return 'html';
    if (hasPdf) return 'pdf';
    if (hasSolution) return 'solution';
    return 'tex';
  });

  const texHref = `${base}/files/${series.id}/tex`;
  const [texSource, setTexSource] = useState<string | null>(null);
  const [texLoading, setTexLoading] = useState(false);
  const [texError, setTexError] = useState<string | null>(null);
  const [texReloadToken, setTexReloadToken] = useState(0);
  const texStateRef = useRef({ texSource, texLoading, texError });
  const highlightedTex = useMemo(
    () => (texSource !== null ? highlightLatex(texSource) : null),
    [texSource]
  );
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);

  useEffect(() => {
    texStateRef.current = { texSource, texLoading, texError };
  }, [texError, texLoading, texSource]);

  useEffect(() => {
    if (tab !== 'tex') return;
    if (!hasTex) return;

    const state = texStateRef.current;
    if (state.texSource !== null || state.texLoading || state.texError) return;

    const load = async () => {
      setTexLoading(true);
      setTexError(null);
      try {
        const res = await fetch(texHref, { credentials: 'include' });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (res.status === 404) {
            throw new Error(`LaTeX file not found on server (${texFile}).`);
          }
          if (res.status === 403) {
            throw new Error('Authentication required to view LaTeX source.');
          }
          throw new Error(body || res.statusText || `Request failed with status ${res.status}`);
        }
        const text = await res.text();
        setTexSource(text);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load LaTeX source';
        setTexError(message);
      } finally {
        setTexLoading(false);
      }
    };

    void load();
  }, [hasTex, tab, texFile, texHref, texReloadToken]);

  useEffect(() => {
    if (tab !== 'html') return;
    if (pendingScrollId === null) return;
    if (!canShowHtmlPreview) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`exercise-${pendingScrollId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingScrollId(null);
      } else {
        setTimeout(() => {
          const el2 = document.getElementById(`exercise-${pendingScrollId}`);
          if (el2) el2.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setPendingScrollId(null);
        }, 60);
      }
    });
  }, [tab, pendingScrollId, canShowHtmlPreview]);

  const handleJump = (id: number) => {
    if (tab !== 'html') setTab('html');
    setPendingScrollId(id);
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-4 z-30 flex items-center justify-between rounded-xl border border-primary/10 bg-background/80 p-2 backdrop-blur-md shadow-sm">
        <div role="tablist" aria-label="Preview tabs" className="flex flex-wrap gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'html'}
            onClick={() => setTab('html')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === 'html'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            Exercises (HTML)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pdf'}
            onClick={() => setTab('pdf')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === 'pdf'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            Exercises (PDF)
          </button>
          {hasSolution && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'solution'}
              onClick={() => setTab('solution')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === 'solution'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              Solutions (PDF)
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tex'}
            onClick={() => setTab('tex')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === 'tex'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            Source (LaTeX)
          </button>
        </div>
      </div>

      <div className="min-h-[500px] rounded-xl border border-border/50 bg-card/50 shadow-sm backdrop-blur-sm p-1">
        <div className="p-4 md:p-6">
          {tab === 'html' && (
            <div className="space-y-6">
              {series.exercises.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Jump to:</span>
                  {series.exercises.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="rounded-md border border-input bg-background/50 px-2 py-1 text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                      onClick={() => handleJump(ex.id)}
                    >
                      Ex {ex.number}
                    </button>
                  ))}
                </div>
              )}
              {canShowHtmlPreview ? (
                exerciseHtmlMap && series.exercises.length > 0 ? (
                  <div className="space-y-8 divide-y divide-border/50">
                    {series.exercises.map((ex) => {
                      const html = exerciseHtmlMap[ex.id] || null;
                      if (!html) return null;
                      return (
                        <div
                          key={`preview-ex-${ex.id}`}
                          id={`exercise-${ex.id}`}
                          className="pt-8 first:pt-0"
                        >
                          <MathJaxHTML
                            key={`mj-${series.id}-${ex.id}-${series.html_rendered_at || 'na'}`}
                            html={html}
                            className="prose prose-sm prose-exercise dark:prose-invert max-w-none"
                            style={{ counterReset: `exercise ${ex.number - 1} figure` }}
                            counterGroup={`preview-${series.id}`}
                            seriesIdForAssets={series.id}
                          />
                          <div className="mt-6 border-t border-border/30 pt-4">
                            {renderCommentsForExercise?.(ex, 'preview')}
                          </div>
                        </div>
                      );
                    })}
                    {series.render_status === 'ok' && series.html_rendered_at && (
                      <div className="pt-8 text-xs text-muted-foreground text-center">
                        Rendered from TeX on {new Date(series.html_rendered_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <MathJaxHTML
                      key={`mj-${series.id}-${series.html_rendered_at || 'na'}`}
                      html={series.html_content || ''}
                      className="prose prose-sm prose-exercise dark:prose-invert max-w-none"
                      seriesIdForAssets={series.id}
                    />
                    {series.render_status === 'ok' && series.html_rendered_at && (
                      <div className="text-xs text-muted-foreground mt-4 border-t pt-2">
                        Rendered from TeX on {new Date(series.html_rendered_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="text-muted-foreground">
                    {series.render_status === 'failed'
                      ? 'HTML render failed.'
                      : htmlLooksLikeTexFallback
                        ? 'HTML preview fell back to raw LaTeX.'
                        : 'No rendered HTML available yet.'}
                  </div>
                  {isStaff && series.render_log && (series.render_status === 'failed' || htmlLooksLikeTexFallback) && (
                    <details className="mt-4 w-full max-w-2xl rounded-md border bg-muted/30 px-3 py-2 text-left">
                      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                        Show render log
                      </summary>
                      <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground font-mono bg-black/10 p-2 rounded">
                        {series.render_log}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'pdf' && (
            <div className="min-h-[600px]">
              {hasPdf ? (
                <PdfPreview key={`${series.id}-exercise`} seriesId={series.id} file="pdf" />
              ) : (
                <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
                  No exercises PDF available for this series.
                </div>
              )}
            </div>
          )}

          {tab === 'solution' && (
            <div className="min-h-[600px]">
              {hasSolution ? (
                <PdfPreview key={`${series.id}-solution`} seriesId={series.id} file="solution" />
              ) : (
                <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
                  No solutions sheet available for this series.
                </div>
              )}
            </div>
          )}

          {tab === 'tex' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {hasTex ? (
                  <Button asChild size="sm" className="gap-2">
                    <a href={texHref} target="_blank" rel="noreferrer">
                      <span className="text-lg">↓</span> Download Source (.tex)
                    </a>
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground">No `.tex` file recorded for this series.</div>
                )}
              </div>

              {texError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 space-y-3">
                  <div className="text-sm font-medium text-destructive">{texError}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTexError(null);
                        setTexSource(null);
                        setTexLoading(false);
                        setTexReloadToken((n) => n + 1);
                      }}
                      disabled={texLoading}
                    >
                      Retry
                    </Button>
                    {hasPdf && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => setTab('pdf')}>
                        Open PDF preview
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {texLoading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
                  Loading LaTeX source...
                </div>
              ) : texSource !== null ? (
                <pre className="gm-tex max-h-[800px] overflow-auto whitespace-pre-wrap rounded-lg border bg-background/50 p-4 text-xs font-mono shadow-inner">
                  <code dangerouslySetInnerHTML={{ __html: highlightedTex || '' }} />
                </pre>
              ) : htmlLooksLikeTexFallback && series.html_content ? (
                <div
                  className="max-h-[800px] overflow-auto rounded-lg border bg-background/50 p-4 text-xs shadow-inner"
                  dangerouslySetInnerHTML={{ __html: series.html_content }}
                />
              ) : texError ? (
                <div className="py-10 text-center text-muted-foreground">Unable to load LaTeX source.</div>
              ) : hasTex ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
                  Loading LaTeX source...
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground">No LaTeX source available.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SeriesDetailPage() {
  const params = useParams();
  const seriesId = params?.seriesId as string;

  const { data: series, error: seriesError, isLoading } = useApiSWR<Series>(
    seriesId ? `/series/${seriesId}?include_html=1` : null
  );
  const { data: lectureSeries } = useApiSWR<Series[]>(
    series && series.lecture_id ? `/lectures/${series.lecture_id}/series` : null
  );
  const { data: me } = useApiSWR<{ id: number; username: string; is_staff?: boolean } | { message: string }>('/auth/me');
  const errorMessage = seriesError instanceof Error ? seriesError.message : seriesError ? 'Failed to load series' : null;
  const apiBase = getApiBase();
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<number, string | null>>({});
  const [commentLoading, setCommentLoading] = useState<Record<number, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const currentUser = me && !('message' in me) ? me : null;
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({});
  const [replyTarget, setReplyTarget] = useState<Record<number, Comment | null>>({});
  const [commentSort, setCommentSort] = useState<'asc' | 'desc'>('asc');
  const [exerciseHtml, setExerciseHtml] = useState<Record<number, string>>({});
  const exerciseIds = useMemo(
    () => series?.exercises.map((ex) => ex.id) ?? [],
    [series]
  );
  const neighborSeries = useMemo(() => {
    if (!series || !lectureSeries || lectureSeries.length === 0) {
      return { prev: null as Series | null, next: null as Series | null };
    }
    // Restrict to the same semester/year as the current series
    const sameTerm = lectureSeries.filter(
      (s) => s.year === series.year && s.semester === series.semester
    );
    const sorted = sameTerm.slice().sort((a, b) => a.number - b.number);
    const idx = sorted.findIndex((s) => s.id === series.id);
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    return { prev, next };
  }, [lectureSeries, series]);
  const { pushToast } = useToast();
  const seriesCrumbs = useMemo(() => {
    if (!series) return null;
    return [
      { label: 'Dashboard', href: '/' },
      { label: 'Lectures', href: '/lectures' },
      { label: series.lecture_name, href: `/lectures/${series.lecture_id}` },
      { label: `Series ${series.number}`, href: `/series/${series.id}`, isCurrent: true },
    ];
  }, [series]);

  useBreadcrumbs(seriesCrumbs);

  useEffect(() => {
    if (!series || !series.html_content || series.render_status !== 'ok') {
      setExerciseHtml({});
      return;
    }
    if (typeof DOMParser === 'undefined') return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(series.html_content, 'text/html');
      const headings = Array.from(doc.querySelectorAll('h2'));
      const byExercise: Record<number, string> = {};

      headings.forEach((h2, idx) => {
        const container = document.createElement('div');
        container.appendChild(h2.cloneNode(true));

        let cursor: ChildNode | null = h2.nextSibling;
        while (cursor) {
          if (cursor.nodeType === Node.ELEMENT_NODE) {
            const tag = (cursor as Element).tagName.toLowerCase();
            const isNextExercise = tag === 'h2';
            const isFootnotes = tag === 'section' && (cursor as Element).classList.contains('footnotes');
            if (isNextExercise || isFootnotes) break;
          }
          container.appendChild(cursor.cloneNode(true));
          cursor = cursor.nextSibling;
        }

        const target = series.exercises[idx];
        if (target) {
          byExercise[target.id] = container.innerHTML.trim();
        }
      });

      setExerciseHtml(byExercise);
    } catch (err) {
      console.warn('Failed to extract per-exercise HTML from series preview', err);
      setExerciseHtml({});
    }
  }, [series]);

  const renderComments = (ex: Exercise, context: 'list' | 'preview' = 'list') => {
    const commentAnchorId = `exercise-${ex.id}-comments-${context}`;
    const exerciseComments = comments[ex.id] || [];
    const commentCount = exerciseComments.length;
    // Default to collapsed unless explicitly expanded
    const isExpanded = expandedComments[ex.id] || false;

    return (
      <div id={commentAnchorId} className="mt-8 border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={() => setExpandedComments(s => ({ ...s, [ex.id]: !s[ex.id] }))}
          className="w-full flex items-center justify-between py-4 hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors group"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground/80 group-hover:text-primary transition-colors">
              <MessageCircle className="h-5 w-5" />
              Discussion
              {commentCount > 0 && <span className="text-sm font-normal text-muted-foreground">({commentCount})</span>}
            </h3>
          </div>
          {!isExpanded && commentCount === 0 && (
            <span className="text-xs text-muted-foreground">Start a discussion</span>
          )}
          {!isExpanded && commentCount > 0 && (
            <div className="flex -space-x-2 mr-2">
              {/* Small preview of avatars if collapsed */}
              {exerciseComments.slice(0, 3).map((c, i) => {
                const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'];
                const color = colors[c.user_id % colors.length];
                return (
                  <div key={c.id} className={`h-6 w-6 rounded-full ring-2 ring-background flex items-center justify-center text-[8px] font-bold text-white ${color}`}>
                    {(c.username || 'U').slice(0, 2).toUpperCase()}
                  </div>
                )
              })}
              {commentCount > 3 && (
                <div className="h-6 w-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                  +{commentCount - 3}
                </div>
              )}
            </div>
          )}
        </button>

        {isExpanded && (
          <div className="pb-6 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="flex justify-end mb-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setCommentSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
              >
                Sort: {commentSort === 'asc' ? 'Oldest first' : 'Newest first'}
              </Button>
            </div>

            <div className="space-y-6">
              {(() => {
                const list = exerciseComments.slice().sort((a, b) => {
                  const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                  return commentSort === 'asc' ? diff : -diff;
                });
                const indexMap = new Map<number, number>();
                list.forEach((item, idx) => indexMap.set(item.id, idx + 1));

                if (list.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed border-muted-foreground/20 bg-muted/5">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                        <MessageCircle className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">No comments yet.</p>
                      <p className="text-xs text-muted-foreground/70">Be the first to share a thought!</p>
                    </div>
                  );
                }

                return list.map((c, idx) => {
                  const num = idx + 1;
                  const parentNum = c.parent_id ? indexMap.get(c.parent_id) : undefined;
                  const isReply = Boolean(c.parent_id);
                  const authorInitials = (c.username || 'U').slice(0, 2).toUpperCase();
                  // Deterministic color for avatar based on user_id
                  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'];
                  const avatarColor = colors[c.user_id % colors.length];

                  return (
                    <div key={c.id} className={`group flex gap-4 ${isReply ? 'pl-8 md:pl-12' : ''}`}>
                      {/* Avatar */}
                      <div className="shrink-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-2 ring-background ${avatarColor}`}>
                          {authorInitials}
                        </div>
                        {isReply && <div className="h-full w-px bg-border/50 mx-auto mt-2 -mb-6" />}
                      </div>

                      <div className="flex-1 space-y-2">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{c.username || `User ${c.user_id}`}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                            {c.updated_at && c.updated_at !== c.created_at && (
                              <span className="text-[10px] text-muted-foreground italic">(edited)</span>
                            )}
                          </div>
                        </div>

                        {/* Reply Context */}
                        {c.parent_username && !c.is_deleted && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded w-fit">
                            <CornerDownRight className="h-3 w-3" />
                            <span>Replying to <strong>{c.parent_username}</strong></span>
                          </div>
                        )}

                        {/* Content */}
                        <div className={`text-sm leading-relaxed ${c.is_deleted ? 'text-muted-foreground italic' : 'text-foreground/90'}`}>
                          {c.is_deleted ? (
                            <p>
                              {(() => {
                                const baseName = c.deleted_by_username || c.username || 'user';
                                const custom = (c.deleted_message || '').trim();
                                const useCustom = custom && !custom.toLowerCase().startsWith('deleted by');
                                return useCustom ? custom : `Deleted by ${baseName}`;
                              })()}
                            </p>
                          ) : editDrafts[c.id] !== undefined ? (
                            <div className="space-y-3 p-3 rounded-lg border bg-card shadow-sm">
                              <textarea
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                value={editDrafts[c.id]}
                                onChange={(e) => setEditDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditDrafts((s) => {
                                      const n = { ...s };
                                      delete n[c.id];
                                      return n;
                                    });
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleUpdateComment(c.id, ex.id, editDrafts[c.id])}
                                  disabled={commentLoading[ex.id]}
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{c.text}</p>
                          )}
                        </div>

                        {/* Actions */}
                        {!c.is_deleted && !editDrafts[c.id] && (
                          <div className="flex items-center gap-4 pt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setReplyTarget((s) => ({ ...s, [ex.id]: c }))}
                            >
                              <Reply className="h-3.5 w-3.5" /> Reply
                            </button>
                            {c.user_id === currentUser?.id && (
                              <button
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                                onClick={() => setEditDrafts((s) => ({ ...s, [c.id]: c.text }))}
                              >
                                <Edit2 className="h-3.5 w-3.5" /> Edit
                              </button>
                            )}
                            {currentUser?.is_staff && (
                              <>
                                <button
                                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
                                  onClick={() => handleDeleteComment(c.id, ex.id, 'soft')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                                <button
                                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
                                  onClick={() => handleDeleteComment(c.id, ex.id, 'hard')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Hard Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {/* Restore Action (Staff) */}
                        {c.is_deleted && currentUser?.is_staff && (
                          <button
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => handleRestoreComment(c.id, ex.id)}
                          >
                            Restore Comment
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Input Area */}
            <div className="mt-8 flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                {replyTarget[ex.id] && (
                  <div className="flex items-center justify-between text-xs bg-muted/50 px-3 py-2 rounded-md border border-border/50">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <CornerDownRight className="h-3.5 w-3.5" />
                      Replying to <span className="font-semibold text-foreground">{replyTarget[ex.id]?.username}</span>
                    </span>
                    <button
                      onClick={() => setReplyTarget((s) => ({ ...s, [ex.id]: null }))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <span className="sr-only">Cancel reply</span>
                      Cancel
                    </button>
                  </div>
                )}
                <div className="relative">
                  <textarea
                    className="w-full min-h-[100px] rounded-xl border border-input bg-card/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm resize-y"
                    placeholder={replyTarget[ex.id] ? "Write your reply..." : "Ask a question or share a thought..."}
                    value={commentDrafts[ex.id] || ''}
                    onChange={(e) => setCommentDrafts((s) => ({ ...s, [ex.id]: e.target.value }))}
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    {commentDrafts[ex.id] && (
                      <Button
                        size="icon"
                        className="h-8 w-8 rounded-lg shadow-sm"
                        onClick={() => handleAddComment(ex.id)}
                        disabled={commentLoading[ex.id]}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {commentErrors[ex.id] && (
                  <div className="text-xs font-medium text-destructive animate-in slide-in-from-top-1">
                    {commentErrors[ex.id]}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const scrollToExercise = (exerciseId: number) => {
    const el = document.getElementById(`exercise-${exerciseId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (exerciseIds.length === 0) return;
    const handler = (ev: KeyboardEvent) => {
      if (!series) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
        return;
      }
      const key = ev.key.toLowerCase();
      if (!ev.shiftKey || (key !== 'j' && key !== 'k')) return;
      ev.preventDefault();
      const currentHash = window.location.hash;
      const currentId = currentHash.startsWith('#exercise-') ? Number(currentHash.replace('#exercise-', '')) : null;
      const currentIndex = currentId ? exerciseIds.indexOf(currentId) : 0;
      const nextIndex = key === 'j' ? Math.min(exerciseIds.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
      const targetId = exerciseIds[nextIndex] ?? exerciseIds[0];
      scrollToExercise(targetId);
      window.location.hash = `exercise-${targetId}`;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [exerciseIds, series]);
  const fetchCommentsForExercise = async (exerciseId: number) => {
    try {
      const data = await apiFetch<Comment[]>('/comments', { params: { exercise_id: String(exerciseId) } });
      setComments((s) => ({ ...s, [exerciseId]: data }));
    } catch {
      setComments((s) => ({ ...s, [exerciseId]: [] }));
    }
  };

  useEffect(() => {
    const loadComments = async () => {
      if (!series) return;
      const entries: Record<number, Comment[]> = {};
      for (const ex of series.exercises) {
        try {
          const c = await apiFetch<Comment[]>('/comments', { params: { exercise_id: String(ex.id) } });
          entries[ex.id] = c;
        } catch {
          entries[ex.id] = [];
        }
      }
      setComments(entries);
    };
    loadComments();
  }, [series]);

  useEffect(() => {
    if (!series) return;
    document.title = `Series ${series.number} · ${series.lecture_name} · Gold Mine V2`;
    addRecentItem({
      type: 'series',
      id: series.id,
      title: `Series ${series.number}${series.title ? ` — ${series.title}` : ''}`,
      subtitle: `${series.lecture_name} · ${series.semester}${series.year}`,
      href: `/series/${series.id}`,
    });
  }, [series]);

  const handleAddComment = async (exerciseId: number) => {
    const text = commentDrafts[exerciseId] || '';
    if (!text.trim()) return;
    setCommentLoading((s) => ({ ...s, [exerciseId]: true }));
    setCommentErrors((s) => ({ ...s, [exerciseId]: null }));
    const tempId = -Date.now();
    const optimistic: Comment = {
      id: tempId,
      user_id: currentUser?.id || 0,
      exercise_id: exerciseId,
      text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      deleted_message: '',
      username: currentUser?.username || 'You',
      parent_id: replyTarget[exerciseId]?.id,
      parent_username: replyTarget[exerciseId]?.username,
    };
    setComments((s) => ({ ...s, [exerciseId]: [optimistic, ...(s[exerciseId] || [])] }));
    try {
      const newComment = await apiFetch<Comment>('/comments', {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: exerciseId,
          text,
          parent_id: replyTarget[exerciseId]?.id,
        }),
      });
      setComments((s) => ({
        ...s,
        [exerciseId]: (s[exerciseId] || []).map((c) => (c.id === tempId ? newComment : c)),
      }));
      setCommentDrafts((s) => ({ ...s, [exerciseId]: '' }));
      setReplyTarget((s) => ({ ...s, [exerciseId]: null }));
      pushToast({ title: 'Comment posted', tone: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add comment';
      setCommentErrors((s) => ({ ...s, [exerciseId]: message }));
      setComments((s) => ({
        ...s,
        [exerciseId]: (s[exerciseId] || []).filter((c) => c.id !== tempId),
      }));
      pushToast({ title: 'Failed to post comment', description: message, tone: 'error' });
    } finally {
      setCommentLoading((s) => ({ ...s, [exerciseId]: false }));
    }
  };

  const handleDeleteComment = async (commentId: number, exerciseId: number, mode: 'soft' | 'hard' = 'soft') => {
    setCommentLoading((s) => ({ ...s, [exerciseId]: true }));
    try {
      const params = new URLSearchParams();
      params.set('mode', mode);
      await apiFetch(`/comments/${commentId}?${params.toString()}`, { method: 'DELETE' });
      await fetchCommentsForExercise(exerciseId);
      pushToast({ title: mode === 'hard' ? 'Comment deleted permanently' : 'Comment deleted', tone: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete comment';
      setCommentErrors((s) => ({ ...s, [exerciseId]: message }));
      pushToast({ title: 'Failed to delete comment', description: message, tone: 'error' });
    } finally {
      setCommentLoading((s) => ({ ...s, [exerciseId]: false }));
    }
  };

  const handleUpdateComment = async (commentId: number, exerciseId: number, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setCommentLoading((s) => ({ ...s, [exerciseId]: true }));
    setCommentErrors((s) => ({ ...s, [exerciseId]: null }));
    try {
      const updated = await apiFetch<Comment>(`/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: clean }),
      });
      setComments((s) => ({
        ...s,
        [exerciseId]: (s[exerciseId] || []).map((c) => (c.id === commentId ? updated : c)),
      }));
      setEditDrafts((s) => {
        const n = { ...s };
        delete n[commentId];
        return n;
      });
      pushToast({ title: 'Comment updated', tone: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to edit comment';
      setCommentErrors((s) => ({ ...s, [exerciseId]: message }));
      pushToast({ title: 'Failed to update comment', description: message, tone: 'error' });
    } finally {
      setCommentLoading((s) => ({ ...s, [exerciseId]: false }));
    }
  };

  const handleRestoreComment = async (commentId: number, exerciseId: number) => {
    setCommentLoading((s) => ({ ...s, [exerciseId]: true }));
    setCommentErrors((s) => ({ ...s, [exerciseId]: null }));
    try {
      await apiFetch<Comment>(`/comments/${commentId}/restore`, { method: 'POST' });
      await fetchCommentsForExercise(exerciseId);
      pushToast({ title: 'Comment restored', tone: 'success' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to restore comment';
      setCommentErrors((s) => ({ ...s, [exerciseId]: message }));
      pushToast({ title: 'Failed to restore comment', description: message, tone: 'error' });
    } finally {
      setCommentLoading((s) => ({ ...s, [exerciseId]: false }));
    }
  };

  if (isLoading) return <div className="p-8 text-muted-foreground animate-pulse">Loading series...</div>;
  if (errorMessage) return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-destructive flex flex-col items-start gap-4 mx-4 mt-4">
      <h3 className="text-lg font-semibold">Error</h3>
      <p>{errorMessage}</p>
      <Button variant="outline" onClick={() => window.location.reload()} className="border-destructive/30 hover:bg-destructive/20">
        Reload Page
      </Button>
    </div>
  );
  if (!series) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Link href={`/lectures/${series.lecture_id}`} className="hover:text-primary transition-colors">
              {series.lecture_name}
            </Link>
            <span>/</span>
            <span className="text-foreground">{series.semester}{series.year}</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Series {series.number}
            {series.title && <span className="font-medium text-foreground/60 ml-3">— {series.title}</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {neighborSeries.prev && (
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
              <Link href={`/series/${neighborSeries.prev.id}`}>
                ← Series {neighborSeries.prev.number}
              </Link>
            </Button>
          )}
          {neighborSeries.next && (
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
              <Link href={`/series/${neighborSeries.next.id}`}>
                Series {neighborSeries.next.number} →
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_350px]">
        <div className="min-w-0 space-y-6">
          <SeriesPreviewTabs
            key={series.id}
            series={series}
            currentUser={currentUser}
            exerciseHtmlMap={exerciseHtml}
            renderCommentsForExercise={(ex, context) => renderComments(ex, context)}
          />
        </div>

        <div className="space-y-6 hidden lg:block">
          <div className="sticky top-6 space-y-6">
            <div className="rounded-xl border border-primary/10 bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Exercises
              </h3>
              {series.exercises.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No exercises found.</p>
              ) : (
                <nav className="space-y-1">
                  {series.exercises.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => scrollToExercise(ex.id)}
                      className="group flex w-full items-start gap-2 rounded-md p-2 text-left text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-mono transition-colors group-hover:border-primary/50 group-hover:text-primary">
                        {ex.number}
                      </span>
                      <span className="line-clamp-2">{ex.title || 'Untitled'}</span>
                      {(comments[ex.id] || []).length > 0 && (
                        <span className="ml-auto text-[10px] text-muted-foreground/50">
                          {(comments[ex.id] || []).length}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              )}
            </div>

            {series.solution_file && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5">
                <h3 className="font-medium text-green-700 dark:text-green-400 mb-2">Solutions Available</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Official solutions have been published for this series.
                </p>
                <Button size="sm" variant="outline" className="w-full border-green-500/30 hover:bg-green-500/10 hover:text-green-600" asChild>
                  <a href={`${apiBase}/files/${series.id}/solution`} target="_blank" rel="noreferrer">
                    Download PDF
                  </a>
                </Button>
              </div>
            )}
            <div className="rounded-xl border border-border/50 bg-card/50 p-5">
              <h3 className="font-medium text-sm mb-2">Downloads</h3>
              <div className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-start gap-2" asChild>
                  <a
                    href={`${apiBase}/files/series/${series.id}/zip`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="text-muted-foreground">📦</span> Series ZIP
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
