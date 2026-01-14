"use client";

import { useEffect, useState } from "react";
import { apiFetch, getApiBase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  seriesId: number;
  file?: "pdf" | "solution";
  className?: string;
};

type PdfMeta = {
  pages: number;
};

export function PdfPreview({ seriesId, file = "pdf", className }: Props) {
  const base = getApiBase().replace(/\/$/, "");
  const [pages, setPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setMetaError(null);
      setImgError(null);
      setPages(null);
      setPage(1);
      try {
        const meta = await apiFetch<PdfMeta>(`/files/${seriesId}/pdf-meta?file=${file}`);
        if (!cancelled) setPages(meta.pages);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load PDF preview";
        // Don't block preview if we can't determine page count; we can still paginate
        // until the image endpoint starts returning 404s.
        if (!cancelled)
          setMetaError(
            message === "Not Found" ? "Page count unavailable." : message
          );
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [file, seriesId]);

  const isSolution = file === "solution";
  const pdfHref = isSolution
    ? `${base}/files/${seriesId}/solution`
    : `${base}/files/${seriesId}/pdf`;
  const imgSrc = `${base}/files/${seriesId}/pdf-preview?page=${page}&file=${file}`;

  const hasPrev = page > 1;
  const hasNext = pages ? page < pages : true;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={!hasPrev}
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => (pages ? Math.min(pages, p + 1) : p + 1))}
          disabled={!hasNext}
        >
          Next
        </Button>
        <div className="text-xs text-muted-foreground">
          Page {page}
          {pages ? ` / ${pages}` : ""}
        </div>
        <Button asChild size="sm" className="ml-auto">
          <a href={pdfHref} target="_blank" rel="noreferrer">
            Open {isSolution ? "solutions PDF" : "PDF"}
          </a>
        </Button>
      </div>

      {imgError && <div className="text-sm text-destructive">{imgError}</div>}
      {!imgError && metaError && (
        <div className="text-xs text-muted-foreground">{metaError}</div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt={`${isSolution ? "Solutions" : "PDF"} preview page ${page}`}
        className="w-full rounded-md border bg-background"
        loading="lazy"
        decoding="async"
        onLoad={() => setImgError(null)}
        onError={() => {
          // If we don't know the page count, treat the first failing page as "end of PDF"
          // and clamp back to the last page that did load.
          if (pages === null && page > 1) {
            const last = page - 1;
            setPages(last);
            setPage(last);
            setMetaError(null);
            setImgError(`Reached end of PDF (last page ${last}).`);
            return;
          }
          setImgError("Failed to load PDF preview image");
        }}
      />
    </div>
  );
}
