'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { apiFetch, getApiBase } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';

type Lecture = {
  id: number;
  name: string;
  long_name: string;
};

type UploadSeries = {
  number: number;
  title?: string;
  dir?: string;
  tex_file?: string;
  pdf_file?: string;
  solution_file?: string;
  issues?: string[];
};

type UploadReport = {
  root: string;
  series: UploadSeries[];
  unassigned: string[];
  warnings: string[];
};

type UploadResponse = {
  id: number;
  status: string;
  fs_path: string;
  report: UploadReport;
};

type UploadCommitResponse = {
  status: string;
  semester_group_id: number;
  render_job_id?: number | null;
  render_enqueued?: boolean;
  render_error?: string;
};

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export default function UploadsPage() {
  const { data: me } = useApiSWR<{ id: number; username: string; is_staff?: boolean } | { message: string }>('/auth/me');
  const { data: lectureData } = useApiSWR<Lecture[]>('/lectures');
  const lectures = useMemo(() => lectureData ?? [], [lectureData]);
  const isStaff = me && !('message' in me) && me.is_staff;

  const [lectureId, setLectureId] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [semester, setSemester] = useState<'HS' | 'FS'>('HS');
  const [professors, setProfessors] = useState('');
  const [assistants, setAssistants] = useState('');
  const [fsPath, setFsPath] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [seriesEdits, setSeriesEdits] = useState<UploadSeries[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const crumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'Uploads', href: '/uploads', isCurrent: true },
    ],
    []
  );
  useBreadcrumbs(crumbs);

  useEffect(() => {
    document.title = 'Uploads · Gold Mine V2';
  }, []);

  useEffect(() => {
    if (!lectureId && lectures.length > 0) {
      setLectureId(String(lectures[0].id));
    }
  }, [lectureId, lectures]);

  const apiBase = getApiBase().replace(/\/$/, '');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setImportStatus(null);

    if (!zipFile) {
      setUploadError('Please choose a zip file.');
      return;
    }
    if (!lectureId || !year) {
      setUploadError('Lecture and year are required.');
      return;
    }

    const formData = new FormData();
    formData.append('file', zipFile);
    formData.append('lecture_id', lectureId);
    formData.append('year', year);
    formData.append('semester', semester);
    formData.append('professors', professors);
    formData.append('assistants', assistants);
    if (fsPath.trim()) formData.append('fs_path', fsPath.trim());

    setUploading(true);
    try {
      const csrf = getCookie('csrftoken');
      const res = await fetch(`${apiBase}/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRFToken': csrf } : undefined,
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = (await res.json()) as UploadResponse;
      setJobId(data.id);
      setReport(data.report);
      setSeriesEdits(data.report.series.map((s) => ({ ...s })));
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSeriesChange = (idx: number, patch: Partial<UploadSeries>) => {
    setSeriesEdits((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const hasBlockingIssues = seriesEdits.some((s) => !s.pdf_file || !s.number);

  const handleImport = async () => {
    if (!jobId) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await apiFetch<UploadCommitResponse>(`/uploads/${jobId}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          overwrite,
          series: seriesEdits.map((s) => ({
            number: Number(s.number),
            title: s.title || '',
            tex_file: s.tex_file || '',
            pdf_file: s.pdf_file || '',
            solution_file: s.solution_file || '',
          })),
        }),
      });
      let message = 'Import completed successfully.';
      if (result?.render_job_id) {
        message += result.render_enqueued
          ? ` Render job queued (#${result.render_job_id}).`
          : ` Render job created (#${result.render_job_id}).`;
      }
      if (result?.render_error) {
        message += ` Render enqueue failed: ${result.render_error}`;
      }
      setImportStatus(message);
    } catch (err: unknown) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!isStaff) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Uploads are restricted to staff accounts.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="border-b border-border/50 pb-6">
        <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Staff Area</p>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          Upload Semester
        </h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl">
          Upload a zip file containing the full semester folder structure. We will analyze it and let you confirm the series details before importing.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_350px] items-start">
        <div className="space-y-8">
          <Card className="border-primary/10 bg-card/40 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="bg-primary/5 px-6 py-4 border-b border-primary/10 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                📤
              </span>
              <h2 className="font-semibold text-lg">New Upload</h2>
            </div>
            <CardContent className="p-6">
              <form onSubmit={handleUpload} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Lecture</label>
                    <select
                      className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      value={lectureId}
                      onChange={(e) => setLectureId(e.target.value)}
                    >
                      {lectures.map((lec) => (
                        <option key={lec.id} value={String(lec.id)}>
                          {lec.name} — {lec.long_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Year</label>
                      <Input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="e.g. 2024"
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Semester</label>
                      <select
                        className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value as 'HS' | 'FS')}
                      >
                        <option value="HS">HS</option>
                        <option value="FS">FS</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">
                      Override Filesystem Path <span className="text-muted-foreground font-normal">(Optional)</span>
                    </label>
                    <Input
                      value={fsPath}
                      onChange={(e) => setFsPath(e.target.value)}
                      placeholder="e.g. QM1/2024HS"
                      className="bg-background/50 font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Leave blank to auto-generate based on lecture and year.
                    </p>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Professors</label>
                    <textarea
                      value={professors}
                      onChange={(e) => setProfessors(e.target.value)}
                      className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all min-h-[80px]"
                      placeholder="One name per line"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Assistants</label>
                    <textarea
                      value={assistants}
                      onChange={(e) => setAssistants(e.target.value)}
                      className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all min-h-[80px]"
                      placeholder="One name per line"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Zip File</label>
                    <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-6 text-center hover:bg-muted/40 transition-colors">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-muted-foreground
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-xs file:font-semibold
                                    file:bg-primary file:text-primary-foreground
                                    hover:file:bg-primary/90"
                      />
                    </div>
                  </div>
                </div>

                {uploadError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                    🚨 {uploadError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  {report && (
                    <div className="mr-auto text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      Detected {report.series.length} series in `{report.root}`
                    </div>
                  )}
                  <Button type="submit" disabled={uploading}>
                    {uploading ? (
                      <>Processing...</>
                    ) : (
                      <>
                        Upload & Validate <span className="ml-2">→</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {report && (
            <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <h2 className="text-xl font-semibold">Validation Report</h2>
              </div>

              {report.warnings?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-amber-500">Warnings</h4>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                    <ul className="list-disc list-inside space-y-1">
                      {report.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {report.unassigned?.length > 0 && (
                <Card className="border-border/50">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between p-4 font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                      <span>Found {report.unassigned.length} unassigned files</span>
                      <span className="group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="px-4 pb-4 border-t border-border/50 bg-muted/10">
                      <ul className="mt-4 space-y-1 text-xs font-mono text-muted-foreground max-h-40 overflow-y-auto">
                        {report.unassigned.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </Card>
              )}

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Series Configuration</h4>
                {seriesEdits.map((s, idx) => (
                  <div key={`${s.dir}-${idx}`} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-4 hover:border-primary/20 transition-all">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="w-24">
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Number</label>
                        <Input
                          type="number"
                          value={s.number}
                          onChange={(e) => handleSeriesChange(idx, { number: Number(e.target.value) })}
                          className="h-8"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
                        <Input
                          value={s.title || ''}
                          onChange={(e) => handleSeriesChange(idx, { title: e.target.value })}
                          placeholder="Optional title"
                          className="h-8"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">PDF File</label>
                        <Input
                          value={s.pdf_file || ''}
                          onChange={(e) => handleSeriesChange(idx, { pdf_file: e.target.value })}
                          className={`h-8 font-mono text-xs ${!s.pdf_file ? 'border-destructive/50 bg-destructive/5' : ''}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">TeX File</label>
                        <Input
                          value={s.tex_file || ''}
                          onChange={(e) => handleSeriesChange(idx, { tex_file: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Solution</label>
                        <Input
                          value={s.solution_file || ''}
                          onChange={(e) => handleSeriesChange(idx, { solution_file: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                    </div>
                    {s.issues && s.issues.length > 0 && (
                      <div className="flex gap-2">
                        {s.issues.map(iss => (
                          <span key={iss} className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                            {iss}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="sticky bottom-4 z-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-primary/20 bg-background/80 p-4 backdrop-blur-md shadow-lg">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="rounded border-primary text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Overwrite existing files if they exist</span>
                </label>

                <div className="flex items-center gap-4 w-full sm:w-auto">
                  {hasBlockingIssues && (
                    <span className="text-xs text-destructive font-medium text-center">
                      Fix missing PDFs to import
                    </span>
                  )}
                  <Button
                    className="w-full sm:w-auto"
                    size="lg"
                    disabled={importing || hasBlockingIssues || !jobId}
                    onClick={handleImport}
                  >
                    {importing ? 'Importing...' : 'Confirm & Import'}
                  </Button>
                </div>
              </div>
              {importStatus && (
                <div className={`text-center p-4 rounded-lg bg-muted ${importStatus.includes('failed') ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {importStatus}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden lg:block space-y-6 sticky top-6">
          <Card className="bg-muted/30 border-none shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                <strong>Zip Structure:</strong> Ensure your zip file contains folders named <code>Series 1</code>, <code>Series 2</code>, etc.
              </p>
              <p>
                <strong>Naming:</strong> Consistent naming (e.g., <code>ex01.pdf</code>, <code>sol01.pdf</code>) helps the auto-detector.
              </p>
              <p>
                <strong>Re-upload:</strong> If validation fails, you can fix your zip and upload again, or manually correct the paths in the form.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
