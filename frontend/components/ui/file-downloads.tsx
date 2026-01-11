import { Button } from "@/components/ui/button";
import { getApiBase } from "@/lib/api";

type Props = {
  seriesId: number;
  pdfFile?: string;
  texFile?: string;
  solutionFile?: string;
  compact?: boolean;
};

export function FileDownloads({ seriesId, pdfFile, texFile, solutionFile, compact = false }: Props) {
  const base = getApiBase();

  const label = (full: string, short: string) => (compact ? short : full);

  return (
    <div className="flex flex-wrap gap-3">
      {pdfFile && (
        <Button asChild>
          <a
            href={`${base}/files/${seriesId}/pdf`}
            target="_blank"
            rel="noreferrer"
            aria-label="Download PDF"
          >
            {label("Download PDF", "PDF")}
          </a>
        </Button>
      )}
      {texFile && (
        <Button variant="secondary" asChild>
          <a
            href={`${base}/files/${seriesId}/tex`}
            target="_blank"
            rel="noreferrer"
            aria-label="Download LaTeX source"
          >
            {label("Download LaTeX", "LaTeX")}
          </a>
        </Button>
      )}
      {solutionFile && (
        <Button variant="outline" asChild>
          <a
            href={`${base}/files/${seriesId}/solution`}
            target="_blank"
            rel="noreferrer"
            aria-label="Download solutions"
          >
            {label("Download solutions", "Solutions")}
          </a>
        </Button>
      )}
      {!pdfFile && !texFile && !solutionFile && (
        <div className="text-sm text-muted-foreground">No files available.</div>
      )}
    </div>
  );
}
