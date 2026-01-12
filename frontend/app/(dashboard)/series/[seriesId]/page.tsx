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
    // Keep the latest state in a ref so the fetch effect doesn't need to depend on
    // (and therefore re-run/cancel due to) texLoading/texError/texSource updates.
    // This avoids cancelling the in-flight fetch immediately after `setTexLoading(true)`.
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
        // Retry once shortly after render if the element isn't ready yet
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
    <div className="space-y-3">
      <div role="tablist" aria-label="Preview tabs" className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === 'html' ? 'secondary' : 'outline'}
          role="tab"
          aria-selected={tab === 'html'}
          onClick={() => setTab('html')}
        >
          Exercises (HTML)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'pdf' ? 'secondary' : 'outline'}
          role="tab"
          aria-selected={tab === 'pdf'}
          onClick={() => setTab('pdf')}
        >
          Exercises (PDF)
        </Button>
        {hasSolution && (
          <Button
            type="button"
            size="sm"
            variant={tab === 'solution' ? 'secondary' : 'outline'}
            role="tab"
            aria-selected={tab === 'solution'}
            onClick={() => setTab('solution')}
          >
            Solutions (PDF)
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={tab === 'tex' ? 'secondary' : 'outline'}
          role="tab"
          aria-selected={tab === 'tex'}
          onClick={() => setTab('tex')}
        >
          Exercises (LaTeX)
        </Button>
      </div>

      <Card>
        <CardContent>
          {tab === 'html' && (
            <div className="space-y-4">
              {series.exercises.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Jump to:</span>
                  {series.exercises.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="rounded-md border border-input bg-background px-2 py-1 text-foreground/80 hover:border-primary/50"
                      onClick={() => handleJump(ex.id)}
                    >
                      Ex {ex.number}
                    </button>
                  ))}
                </div>
              )}
              {canShowHtmlPreview ? (
                exerciseHtmlMap && series.exercises.length > 0 ? (
                  <div className="space-y-4">
                  {series.exercises.map((ex) => {
                    const html = exerciseHtmlMap[ex.id] || null;
                    if (!html) return null;
                    return (
                      <div
                        key={`preview-ex-${ex.id}`}
                        id={`exercise-${ex.id}`}
                        className="space-y-3 pt-1"
                      >
                        <MathJaxHTML
                          key={`mj-${series.id}-${ex.id}-${series.html_rendered_at || 'na'}`}
                          html={html}
                          className="prose prose-sm prose-exercise dark:prose-invert max-w-none"
                          style={{ counterReset: `exercise ${ex.number - 1} figure` }}
                          counterGroup={`preview-${series.id}`}
                          seriesIdForAssets={series.id}
                        />
                        {renderCommentsForExercise?.(ex, 'preview')}
                      </div>
                    );
                  })}
                  {series.render_status === 'ok' && series.html_rendered_at && (
                    <div className="text-xs text-muted-foreground">
                      Rendered from TeX on {new Date(series.html_rendered_at).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <MathJaxHTML
                    key={`mj-${series.id}-${series.html_rendered_at || 'na'}`}
                    html={series.html_content || ''}
                    className="prose prose-sm prose-exercise dark:prose-invert max-w-none"
                    seriesIdForAssets={series.id}
                  />
                  {series.render_status === 'ok' && series.html_rendered_at && (
                    <div className="text-xs text-muted-foreground">
                      Rendered from TeX on {new Date(series.html_rendered_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  {series.render_status === 'failed'
                    ? 'HTML render failed.'
                    : htmlLooksLikeTexFallback
                      ? 'HTML preview fell back to raw LaTeX.'
                      : 'No rendered HTML available yet.'}
                </div>
                {isStaff && series.render_log && (series.render_status === 'failed' || htmlLooksLikeTexFallback) && (
                  <details className="rounded-md border bg-muted/30 px-3 py-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Show render log
                    </summary>
                    <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                      {series.render_log}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'pdf' && (
          <div className="space-y-3">
            {hasPdf ? (
              <PdfPreview key={`${series.id}-exercise`} seriesId={series.id} file="pdf" />
            ) : (
              <div className="text-sm text-muted-foreground">No exercises PDF available for this series.</div>
            )}
          </div>
        )}

        {tab === 'solution' && (
          <div className="space-y-3">
            {hasSolution ? (
              <PdfPreview key={`${series.id}-solution`} seriesId={series.id} file="solution" />
            ) : (
              <div className="text-sm text-muted-foreground">No solutions sheet available for this series.</div>
            )}
          </div>
        )}

        {tab === 'tex' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {hasTex ? (
                <Button asChild size="sm" variant="secondary">
                  <a href={texHref} target="_blank" rel="noreferrer">
                    Download LaTeX
                  </a>
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">No `.tex` file recorded for this series.</div>
              )}
            </div>

            {texError && (
              <div className="space-y-2">
                <div className="text-sm text-destructive">{texError}</div>
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
              <div className="text-sm text-muted-foreground">Loading LaTeX…</div>
            ) : texSource !== null ? (
              <pre className="gm-tex max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                <code dangerouslySetInnerHTML={{ __html: highlightedTex || '' }} />
              </pre>
            ) : htmlLooksLikeTexFallback && series.html_content ? (
              <div
                className="max-h-[600px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs"
                dangerouslySetInnerHTML={{ __html: series.html_content }}
              />
            ) : texError ? (
              <div className="text-sm text-muted-foreground">Unable to load LaTeX source.</div>
            ) : hasTex ? (
              <div className="text-sm text-muted-foreground">Loading LaTeX…</div>
            ) : (
              <div className="text-sm text-muted-foreground">No LaTeX source available.</div>
            )}
          </div>
        )}
        </CardContent>
      </Card>
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
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<number, string | null>>({});
  const [commentLoading, setCommentLoading] = useState<Record<number, boolean>>({});
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
    return (
      <details id={commentAnchorId} className="gm-comments mt-3">
        <summary>
          Comments ({(comments[ex.id] || []).length})
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            Click to toggle
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setCommentSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
            >
              Sort: {commentSort === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}
            </Button>
          </div>
        {(() => {
          const list = (comments[ex.id] || []).slice().sort((a, b) => {
            const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            return commentSort === 'asc' ? diff : -diff;
          });
          const indexMap = new Map<number, number>();
          list.forEach((item, idx) => indexMap.set(item.id, idx + 1));
          if (list.length === 0) {
            return <div className="text-xs text-muted-foreground">No comments yet.</div>;
          }
          return list.map((c, idx) => {
            const num = idx + 1;
            const parentNum = c.parent_id ? indexMap.get(c.parent_id) : undefined;
            const isReply = Boolean(c.parent_id);
            return (
              <div
                key={c.id}
                className={`rounded border bg-background px-3 py-2 text-xs shadow-[0_2px_6px_-4px_rgba(0,0,0,0.35)] ${
                  isReply ? 'ml-4 border-l-4 border-primary/30' : ''
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-medium">{c.username || `User ${c.user_id}`}</span>
                  <span className="text-muted-foreground">
                    #{num} • {new Date(c.created_at).toLocaleString()}
                    {c.updated_at && c.updated_at !== c.created_at ? ` (edited ${new Date(c.updated_at).toLocaleString()})` : ''}
                  </span>
                </div>
                {c.parent_username && !c.is_deleted && (
                  <div className="text-[11px] text-muted-foreground mb-1">
                    ↪ Reply to {c.parent_username}
                    {parentNum ? ` (#${parentNum})` : c.parent_id ? ` (#${c.parent_id})` : ''}
                  </div>
                )}
                {c.is_deleted ? (
                  <p className="text-foreground/70 whitespace-pre-wrap italic">
                    {(() => {
                      const baseName = c.deleted_by_username || c.username || 'user';
                      const timePart = c.deleted_at ? ` on ${new Date(c.deleted_at).toLocaleString()}` : '';
                      const custom = (c.deleted_message || '').trim();
                      // If custom already starts with "deleted by", ignore it to avoid duplication.
                      const useCustom = custom && !custom.toLowerCase().startsWith('deleted by');
                      return useCustom ? custom : `Deleted by ${baseName}${timePart}`;
                    })()}
                  </p>
                ) : editDrafts[c.id] !== undefined ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      rows={2}
                      value={editDrafts[c.id]}
                      onChange={(e) =>
                        setEditDrafts((s) => ({ ...s, [c.id]: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
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
                        type="button"
                        size="sm"
                        onClick={() => handleUpdateComment(c.id, ex.id, editDrafts[c.id])}
                        disabled={commentLoading[ex.id]}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">{c.text}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {!c.is_deleted && (
                        <button
                          type="button"
                          className="underline decoration-dotted underline-offset-2"
                          onClick={() =>
                            setReplyTarget((s) => ({ ...s, [ex.id]: c }))
                          }
                        >
                          Reply
                        </button>
                      )}
                      {!c.is_deleted && c.user_id === currentUser?.id && (
                        <button
                          type="button"
                          className="underline decoration-dotted underline-offset-2"
                          onClick={() =>
                            setEditDrafts((s) => ({ ...s, [c.id]: c.text }))
                          }
                        >
                          Edit
                        </button>
                      )}
                      {currentUser?.is_staff && (
                        <>
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-2"
                            onClick={() => handleDeleteComment(c.id, ex.id, 'soft')}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-2"
                            onClick={() => handleDeleteComment(c.id, ex.id, 'hard')}
                          >
                            Hard delete
                          </button>
                          {c.is_deleted && (
                            <button
                              type="button"
                              className="underline decoration-dotted underline-offset-2"
                              onClick={() => handleRestoreComment(c.id, ex.id)}
                            >
                              Restore
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          });
        })()}
        <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/50 bg-background/80 px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground">Add a comment</div>
          <textarea
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-xs"
            rows={3}
            value={commentDrafts[ex.id] || ''}
            onChange={(e) =>
              setCommentDrafts((s) => ({ ...s, [ex.id]: e.target.value }))
            }
            placeholder="Share a hint, correction, or question…"
          />
          {commentErrors[ex.id] && (
            <div className="text-xs text-destructive">{commentErrors[ex.id]}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => handleAddComment(ex.id)}
              disabled={commentLoading[ex.id]}
            >
              Post
            </Button>
            {replyTarget[ex.id] && (
              <div className="text-xs text-muted-foreground">
                Replying to {replyTarget[ex.id]?.username || `#${replyTarget[ex.id]?.id}`}
                <button
                  type="button"
                  className="ml-2 text-primary underline-offset-2 hover:underline"
                  onClick={() => setReplyTarget((s) => ({ ...s, [ex.id]: null }))}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </details>
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

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading series…</div>;
  if (errorMessage) return <div className="p-4 text-destructive">{errorMessage}</div>;
  if (!series) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {series.lecture_name} · {series.semester}{series.year}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Series {series.number}{series.title ? ` — ${series.title}` : ''}
          </h1>
        </div>
        <Link href={`/lectures/${series.lecture_id}`} className="text-sm text-primary hover:underline">
          ← Back to lecture
        </Link>
      </div>

      {(neighborSeries.prev || neighborSeries.next) && (
        <div className="flex items-center gap-3 text-sm">
          {neighborSeries.prev ? (
            <Link
              href={`/series/${neighborSeries.prev.id}`}
              className="rounded-md border bg-muted/60 px-3 py-1 hover:border-primary hover:text-primary"
            >
              ← Previous series (#{neighborSeries.prev.number})
            </Link>
          ) : (
            <span className="rounded-md border border-dashed bg-muted/30 px-3 py-1 text-muted-foreground">No previous</span>
          )}
          {neighborSeries.next ? (
            <Link
              href={`/series/${neighborSeries.next.id}`}
              className="rounded-md border bg-muted/60 px-3 py-1 hover:border-primary hover:text-primary"
            >
              Next series (#{neighborSeries.next.number}) →
            </Link>
          ) : (
            <span className="rounded-md border border-dashed bg-muted/30 px-3 py-1 text-muted-foreground">No next</span>
          )}
        </div>
      )}

      <SeriesPreviewTabs
        key={series.id}
        series={series}
        currentUser={currentUser}
        exerciseHtmlMap={exerciseHtml}
        renderCommentsForExercise={(ex, context) => renderComments(ex, context)}
      />

    </div>
  );
}
