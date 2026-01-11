/* Small client helper to load MathJax v3 once and typeset provided content. */
'use client';

import { useEffect, useRef } from 'react';
import { getApiBase } from '@/lib/api';

const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';

type Props = {
  html: string;
  className?: string;
  seriesIdForAssets?: number;
};

declare global {
  interface Window {
    MathJax?: {
      tex?: {
        inlineMath?: [string, string][];
        displayMath?: [string, string][];
        processEscapes?: boolean;
        macros?: Record<string, string>;
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
  }
}

async function ensureMathJaxReady() {
  if (window.MathJax?.typesetPromise) return;

  if (!window.__gm_mathjax_loading) {
    window.__gm_mathjax_loading = (async () => {
      if (!window.__gm_mathjax_configured) {
        window.__gm_mathjax_configured = true;
        window.MathJax = {
          tex: {
            inlineMath: [['\\(', '\\)'], ['$', '$']],
            displayMath: [['\\[', '\\]'], ['$$', '$$']],
            processEscapes: true,
            macros: {
              // Common LaTeX font switches/macros that appear in legacy sources.
              // MathJax doesn't support all of them; define them as no-ops/aliases.
              normalfont: '',
              AA: 'Å',
            },
            // Number all display math by default (starred envs remain unnumbered).
            // This also covers plain `\[ ... \]` blocks produced by pandoc.
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

export function MathJaxHTML({ html, className, seriesIdForAssets }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!ref.current) return;
        await ensureMathJaxReady();
        if (!cancelled) {
          window.MathJax?.typesetClear?.([ref.current]);
          window.MathJax?.texReset?.();

          // Important: let MathJax own this subtree. Avoid React clobbering MathJax DOM mutations.
          ref.current.innerHTML = html;

          const apiBase = getApiBase();

          // Pandoc emits <embed src="..."> for some includes (PDF/EPS). Convert those to <img>
          // so we can rewrite them to the API asset endpoint and show a placeholder on failure.
          const embeds = Array.from(ref.current.querySelectorAll('embed[src]'));
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

          const images = Array.from(ref.current.querySelectorAll('img[src]'));
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

          await window.MathJax?.typesetPromise?.([ref.current]);
        }
      } catch (err) {
        console.warn('MathJax load/typeset error', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [html, seriesIdForAssets]);

  return <div ref={ref} className={className} />;
}
