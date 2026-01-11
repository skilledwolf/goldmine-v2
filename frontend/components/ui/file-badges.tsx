import { cn } from "@/lib/utils";

type Props = {
  pdfFile?: string;
  texFile?: string;
  solutionFile?: string;
  className?: string;
};

export function FileBadges({ pdfFile, texFile, solutionFile, className }: Props) {
  const hasAny = pdfFile || texFile || solutionFile;
  return (
    <div className={cn("flex flex-wrap gap-2 text-[11px] text-muted-foreground", className)}>
      {pdfFile && <span className="rounded-full bg-secondary px-2 py-0.5">PDF</span>}
      {texFile && <span className="rounded-full bg-secondary px-2 py-0.5">TeX</span>}
      {solutionFile && <span className="rounded-full bg-secondary px-2 py-0.5">Solutions</span>}
      {!hasAny && <span className="text-muted-foreground">No files</span>}
    </div>
  );
}

