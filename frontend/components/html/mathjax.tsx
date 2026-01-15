/* Small client helper to load MathJax v3 once and typeset provided content. */
'use client';

import { useEffect, useRef } from 'react';
import { getApiBase } from '@/lib/api';
import DOMPurify from 'dompurify';

const MATHJAX_URL =
  process.env.NEXT_PUBLIC_MATHJAX_URL || 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, svg: true, mathMl: true },
  ADD_ATTR: ['target', 'rel'],
};

type Props = {
  html: string;
  className?: string;
  seriesIdForAssets?: number;
  style?: React.CSSProperties;
  /**
   * When false, keep MathJax equation counters across renders (useful when splitting one sheet into multiple blocks).
   * Default: true (reset numbering per render).
   */
  resetCounters?: boolean;
  /**
    * Provide a stable key to reset counters only once per logical group.
    * Example: counterGroup="preview-74" to share numbering across multiple blocks of one series.
    */
  counterGroup?: string;
};

type MathJaxGroupState = {
  elements: Set<HTMLElement>;
  resetCounters: boolean;
  scheduled: boolean;
  needsRun: boolean;
};

declare global {
  interface Window {
    MathJax?: {
      loader?: {
        load?: string[];
      };
      tex?: {
        packages?: Record<string, string[]>;
        inlineMath?: [string, string][];
        displayMath?: [string, string][];
        processEscapes?: boolean;
        macros?: Record<string, unknown>;
        tags?: 'all' | 'ams' | 'none';
      };
      options?: {
        skipHtmlTags?: string[];
      };
      typesetPromise?: (elems?: Element[]) => Promise<void>;
      typesetClear?: (elems?: Element[]) => void;
      texReset?: () => void;
      startup?: { promise?: Promise<void> };
    };
    __gm_mathjax_configured?: boolean;
    __gm_mathjax_loading?: Promise<void>;
    __gm_mathjax_groups?: Map<string, MathJaxGroupState>;
  }
}

function transformSolutions(root: HTMLElement) {
  const blockquotes = Array.from(root.querySelectorAll('blockquote'));
  for (const bq of blockquotes) {
    const firstP = bq.querySelector('p');
    const strong = firstP?.querySelector('strong');
    const boldSpan = !strong ? firstP?.querySelector('span.ltx_font_bold') : null;
    const labelNode = strong || boldSpan;
    const label = labelNode?.textContent?.trim().replace(/\.$/, '').toLowerCase();
    if (label !== 'solution') continue;

    const details = document.createElement('details');
    details.className = 'gm-solution';

    const summary = document.createElement('summary');
    summary.textContent = 'Solution';
    details.appendChild(summary);

    const nodes = Array.from(bq.childNodes);
    nodes.forEach((node) => {
      if (node === firstP) {
        const clone = (node as HTMLElement).cloneNode(true) as HTMLElement;
        const labelClone = clone.querySelector('strong, span.ltx_font_bold');
        if (labelClone) labelClone.remove();
        if (clone.textContent?.trim()) {
          details.appendChild(clone);
        }
        return;
      }
      details.appendChild(node.cloneNode(true));
    });

    bq.replaceWith(details);
  }
}

function transformLatexmlExerciseHeadings(root: HTMLElement) {
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h2.ltx_title'));
  for (const h2 of headings) {
    const raw = (h2.textContent || '').replace(/\s+/g, ' ').trim();
    const match = raw.match(/^(Exercise|Aufgabe|Problem)\s+(\d+)\.?\s*$/i);
    if (!match) continue;
    const label = match[1];
    const num = match[2];

    const section = h2.closest<HTMLElement>('section.ltx_paragraph');
    if (!section) continue;

    const firstBlock = h2.nextElementSibling as HTMLElement | null;
    const bold = firstBlock?.querySelector<HTMLElement>('span.ltx_text.ltx_font_bold');
    if (!bold) continue;

    const titleHtml = (bold.innerHTML || '').trim();
    if (!titleHtml) continue;

    const separator = label.toLowerCase() === 'problem' ? '. ' : ': ';
    h2.innerHTML = `${label} ${num}${separator}${titleHtml}`;

    bold.remove();
    const maybePara = firstBlock?.querySelector('p');
    if (maybePara && !(maybePara.textContent || '').trim()) {
      maybePara.remove();
    }
    if (firstBlock && !(firstBlock.textContent || '').trim()) {
      firstBlock.remove();
    }
  }
}

function transformLatexmlUnnumberedExerciseHeading(root: HTMLElement) {
  // Only add an "Exercise N:" prefix when the caller sets up the exercise counter reset
  // (i.e. per-exercise rendering on the series page).
  if (!root.style.counterReset) return;

  const firstHeading = root.querySelector<HTMLElement>('h2.ltx_title');
  if (!firstHeading) return;

  const raw = (firstHeading.textContent || '').replace(/\s+/g, ' ').trim();
  // If the heading already contains its own numbering (LaTeXML `Exercise 1: ...` etc),
  // keep it as-is so we don't get a duplicated "Exercise N:" prefix from CSS.
  if (/^(Exercise|Aufgabe|Problem)\s+\d+\b/i.test(raw)) return;

  // Allow CSS counters to inject "Exercise N:" using `.prose-exercise h2:not(.ltx_title)::before`.
  firstHeading.classList.remove('ltx_title');
}

function transformLatexmlFootnotes(root: HTMLElement) {
  const notes = Array.from(root.querySelectorAll<HTMLElement>('span.ltx_note.ltx_role_footnote'));
  if (notes.length === 0) return;

  const section = document.createElement('section');
  section.className = 'footnotes';
  section.appendChild(document.createElement('hr'));

  const ol = document.createElement('ol');
  section.appendChild(ol);

  for (const note of notes) {
    const mark = (note.querySelector('sup.ltx_note_mark')?.textContent || '').trim();
    const number = mark || String(ol.children.length + 1);
    const numericValue = /^\d+$/.test(number) ? Number.parseInt(number, 10) : null;

    const content = note.querySelector<HTMLElement>('span.ltx_note_outer > span.ltx_note_content');
    let bodyHtml = '';
    if (content) {
      const clone = content.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('sup.ltx_note_mark, span.ltx_tag_note').forEach((el) => el.remove());
      bodyHtml = (clone.innerHTML || '').trim();
    } else {
      bodyHtml = (note.textContent || '').trim();
    }

    const sup = document.createElement('sup');
    sup.className = 'gm-footnote-ref';
    sup.textContent = number;
    note.replaceWith(sup);

    const li = document.createElement('li');
    if (numericValue !== null && Number.isFinite(numericValue)) {
      li.value = numericValue;
    }
    li.innerHTML = bodyHtml;
    ol.appendChild(li);
  }

  if (ol.children.length > 0) {
    root.appendChild(section);
  }
}

function transformLearningGoals(root: HTMLElement) {
  const italics = Array.from(root.querySelectorAll<HTMLElement>('span.ltx_text.ltx_font_italic'));
  for (const el of italics) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/^lernziel\s*:/i.test(text) && !/^learning goal\s*:/i.test(text)) continue;
    const container = el.closest<HTMLElement>('div.ltx_para') || el.closest<HTMLElement>('p') || null;
    if (!container) continue;
    container.classList.add('gm-goal');
  }
}

function transformHints(root: HTMLElement) {
  const italics = Array.from(root.querySelectorAll<HTMLElement>('span.ltx_text.ltx_font_italic'));
  for (const el of italics) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/^(hinweis|hinweise|hint|hints)\s*:/i.test(text)) continue;

    const p = el.closest<HTMLElement>('p') || null;
    if (!p) continue;

    if (p.closest('.gm-hint')) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'gm-hint';
    p.replaceWith(wrapper);
    wrapper.appendChild(p);
  }
}

function transformLatexmlEquationAlignment(root: HTMLElement) {
  const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>('table.ltx_eqn_table tr.ltx_eqn_row'));
  for (const row of rows) {
    // In many LaTeXML outputs (esp. `align`), a single-column equation may still be tagged as `ltx_align_right`.
    // When there's no left column, treat it as centered (like TeX would).
    if (row.querySelector('td.ltx_align_left')) continue;

    const mathCells = Array.from(
      row.querySelectorAll<HTMLTableCellElement>('td.ltx_eqn_cell.ltx_align_right:not(.ltx_eqn_eqno)')
    );
    for (const cell of mathCells) {
      cell.classList.remove('ltx_align_right');
    }
  }
}

async function ensureMathJaxReady() {
  if (window.MathJax?.typesetPromise) return;

  if (!window.__gm_mathjax_loading) {
    window.__gm_mathjax_loading = (async () => {
      if (!window.__gm_mathjax_configured) {
        window.__gm_mathjax_configured = true;
        window.MathJax = {
          loader: { load: ['[tex]/ams', '[tex]/physics', '[tex]/braket', '[tex]/cancel', '[tex]/bbox'] },
          tex: {
            packages: { '[+]': ['ams', 'physics', 'braket', 'cancel', 'bbox'] },
            inlineMath: [['\\(', '\\)'], ['$', '$']],
            displayMath: [['\\[', '\\]'], ['$$', '$$']],
            processEscapes: true,
            macros: {
              // Common LaTeX font switches/macros that appear in legacy sources.
              // MathJax doesn't support all of them; define them as no-ops/aliases.
              normalfont: '',
              AA: 'Å',
              // Legacy math helpers
              tr: '\\operatorname{tr}',
              Tr: '\\operatorname{Tr}',
              mathbbm: ['\\mathbb{#1}', 1],
              id: '\\mathbb{1}',
              unit: '\\mathbb{1}',
              slashed: '\\not\\!',
              // Common Dirac/QIT helpers (fallbacks even if physics/braket loaded)
              ket: ['\\left|#1\\right\\rangle', 1],
              bra: ['\\left\\langle#1\\right|', 1],
              braket: ['\\left\\langle#1\\middle|#2\\right\\rangle', 2],
              ketbra: ['\\left|#1\\right\\rangle\\!\\left\\langle#2\\right|', 2],
              proj: ['\\left|#1\\right\\rangle\\!\\left\\langle#2\\right|', 2],
              pure: ['\\left|#1\\right\\rangle\\!\\left\\langle#1\\right|', 1],
              matrixel: ['\\left\\langle#1\\middle|#2\\middle|#3\\right\\rangle', 3],
              avg: ['\\left\\langle#1\\right\\rangle', 1],
              abs: ['\\left|#1\\right|', 1],
              norm: ['\\left\\lVert#1\\right\\rVert', 1],
              comm: ['\\left[#1,#2\\right]', 2],
              anticom: ['\\left\\{#1,#2\\right\\}', 2],
              sfrac: ['\\tfrac{#1}{#2}', 2],
              Realpart: ['\\operatorname{Re}\\left(#1\\right)', 1],
              Im: '\\operatorname{Im}',
              Re: '\\operatorname{Re}',
            },
            // Number all display math by default (starred envs remain unnumbered).
            // This also covers plain `\[ ... \]` blocks produced by the TeX->HTML renderer.
            tags: 'all',
          },
          options: {
            skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          },
        };
      }

      const scriptId = 'goldmine-mathjax';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.type = 'text/javascript';
        script.src = MATHJAX_URL;
        script.async = true;
        document.head.appendChild(script);
      }

      await new Promise<void>((resolve, reject) => {
        if (window.MathJax?.typesetPromise) return resolve();
        script!.addEventListener('load', () => resolve(), { once: true });
        script!.addEventListener('error', () => reject(new Error('MathJax failed to load')), { once: true });
      });

      if (window.MathJax?.startup?.promise) {
        await window.MathJax.startup.promise;
      }
    })();
  }

  await window.__gm_mathjax_loading;
}

function compareDomOrder(a: HTMLElement, b: HTMLElement) {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  return 0;
}

function getGroupState(name: string, resetCounters: boolean) {
  const groups = (window.__gm_mathjax_groups = window.__gm_mathjax_groups || new Map());
  let state = groups.get(name);
  if (!state) {
    state = { elements: new Set<HTMLElement>(), resetCounters, scheduled: false, needsRun: false };
    groups.set(name, state);
  } else {
    state.resetCounters = state.resetCounters && resetCounters;
  }
  return state;
}

function scheduleGroupTypeset(name: string) {
  const groups = window.__gm_mathjax_groups;
  if (!groups) return;
  const state = groups.get(name);
  if (!state) return;

  state.needsRun = true;
  if (state.scheduled) return;
  state.scheduled = true;

  const runner = async () => {
    try {
      await ensureMathJaxReady();
      // Run until no further invalidations are queued.
      while (state.needsRun) {
        state.needsRun = false;
        const elements = Array.from(state.elements).filter((el) => el.isConnected);
        if (elements.length === 0) continue;

        const sorted = elements.sort(compareDomOrder);
        window.MathJax?.typesetClear?.(sorted);
        if (state.resetCounters !== false) {
          window.MathJax?.texReset?.();
        }
        await window.MathJax?.typesetPromise?.(sorted);
      }
    } catch (err) {
      console.warn('MathJax group typeset error', err);
    } finally {
      state.scheduled = false;
    }
  };

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(runner);
  } else {
    Promise.resolve().then(runner);
  }
}

export function MathJaxHTML({ html, className, seriesIdForAssets, style, resetCounters = true, counterGroup }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    const load = async () => {
      try {
        if (!node) return;

        // Important: let MathJax own this subtree. Avoid React clobbering MathJax DOM mutations.
        const sanitized = DOMPurify.sanitize(html, SANITIZE_CONFIG);
        node.innerHTML = sanitized;

        const apiBase = getApiBase();

        const links = Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'));
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (/^www\./i.test(href)) {
            link.setAttribute('href', `https://${href}`);
          }
        }

        // Some renderers emit <embed src="..."> for some includes (PDF/EPS). Convert those to <img>
        // so we can rewrite them to the API asset endpoint and show a placeholder on failure.
        const embeds = Array.from(node.querySelectorAll<HTMLEmbedElement>('embed[src]'));
        for (const embed of embeds) {
          const originalSrc = embed.getAttribute('src') || '';
          if (!originalSrc) continue;

          const img = document.createElement('img');
          for (const attr of Array.from(embed.attributes)) {
            if (attr.name.toLowerCase() === 'src') continue;
            img.setAttribute(attr.name, attr.value);
          }
          img.setAttribute('src', originalSrc);
          embed.replaceWith(img);
        }

        const images = Array.from(node.querySelectorAll<HTMLImageElement>('img[src]'));
        for (const img of images) {
          const originalSrc = img.getAttribute('src') || '';
          if (!originalSrc) continue;

          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          if (!img.getAttribute('alt')) {
            img.setAttribute('alt', 'figure');
          }

          if (!img.dataset.gmOriginalSrc) {
            img.dataset.gmOriginalSrc = originalSrc;
          }

          if (apiBase && typeof seriesIdForAssets === 'number') {
            if (
              originalSrc.startsWith('http://') ||
              originalSrc.startsWith('https://') ||
              originalSrc.startsWith('data:') ||
              originalSrc.startsWith('blob:')
            ) {
              continue;
            }
            const normalizedApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
            const url = new URL(
              `${normalizedApiBase}/files/${seriesIdForAssets}/asset`,
              window.location.origin
            );
            url.searchParams.set('ref', originalSrc);
            img.setAttribute('src', url.toString());
          }

          if (!img.dataset.gmMissingHandler) {
            img.dataset.gmMissingHandler = '1';
            img.addEventListener(
              'error',
              () => {
                const original = img.dataset.gmOriginalSrc || originalSrc;
                const placeholder = document.createElement('div');
                placeholder.className = 'gm-missing-asset';
                placeholder.textContent = `Missing image: ${original}`;
                img.insertAdjacentElement('afterend', placeholder);
                img.remove();
              },
              { once: true }
            );
          }
        }

        transformLatexmlExerciseHeadings(node);
        transformLatexmlUnnumberedExerciseHeading(node);
        transformLearningGoals(node);
        transformHints(node);
        transformLatexmlEquationAlignment(node);
        transformLatexmlFootnotes(node);
        transformSolutions(node);

        if (counterGroup) {
          const state = getGroupState(counterGroup, resetCounters !== false);
          state.elements.add(node);
          scheduleGroupTypeset(counterGroup);
          return;
        }

        await ensureMathJaxReady();
        if (cancelled || !node) return;
        window.MathJax?.typesetClear?.([node]);
        if (resetCounters !== false) {
          window.MathJax?.texReset?.();
        }
        await window.MathJax?.typesetPromise?.([node]);
      } catch (err) {
        console.warn('MathJax load/typeset error', err);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (counterGroup && node) {
        const groups = window.__gm_mathjax_groups;
        const state = groups?.get(counterGroup);
        state?.elements.delete(node);
        if (state && state.elements.size === 0) {
          groups?.delete(counterGroup);
        } else if (state) {
          scheduleGroupTypeset(counterGroup);
        }
      }
    };
  }, [html, seriesIdForAssets, resetCounters, counterGroup]);

  return <div ref={ref} className={className} style={style} />;
}
