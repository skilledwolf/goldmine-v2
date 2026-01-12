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

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export default function UploadsPage() {
  const { data: me } = useApiSWR<{ id: number; username: string; is_staff?: boolean } | { message: string }>('/auth/me');
  const { data: lectureData } = useApiSWR<Lecture[]>('/lectures');
  const lectures = lectureData ?? [];
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
      await apiFetch(`/uploads/${jobId}/commit`, {
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
      setImportStatus('Import completed successfully.');
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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Staff</p>
        <h1 className="text-3xl font-bold tracking-tight">Upload new semester</h1>
        <p className="text-sm text-muted-foreground">
          Upload a zip file of a semester folder. We will validate and suggest series entries before import.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload zip</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-muted-foreground">
              Lecture
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={lectureId}
                onChange={(e) => setLectureId(e.target.value)}
              >
                {lectures.map((lec) => (
                  <option key={lec.id} value={String(lec.id)}>
                    {lec.name} — {lec.long_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-muted-foreground">
              Year
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2024"
                className="mt-1"
              />
            </label>
            <label className="text-sm font-medium text-muted-foreground">
              Semester
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={semester}
                onChange={(e) => setSemester(e.target.value as 'HS' | 'FS')}
              >
                <option value="HS">HS</option>
                <option value="FS">FS</option>
              </select>
            </label>
            <label className="text-sm font-medium text-muted-foreground">
              fs_path (optional)
              <Input
                value={fsPath}
                onChange={(e) => setFsPath(e.target.value)}
                placeholder="QM1/2024HS"
                className="mt-1"
              />
            </label>
            <label className="text-sm font-medium text-muted-foreground md:col-span-2">
              Professors
              <textarea
                value={professors}
                onChange={(e) => setProfessors(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                placeholder="One per line"
              />
            </label>
            <label className="text-sm font-medium text-muted-foreground md:col-span-2">
              Assistants
              <textarea
                value={assistants}
                onChange={(e) => setAssistants(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                placeholder="One per line"
              />
            </label>
            <label className="text-sm font-medium text-muted-foreground md:col-span-2">
              Zip file
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm"
              />
            </label>

            {uploadError && <div className="text-sm text-destructive md:col-span-2">{uploadError}</div>}

            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload & validate'}
              </Button>
              {report && (
                <span className="text-xs text-muted-foreground">
                  Detected {report.series.length} series; root: {report.root}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Validation report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.warnings?.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Warnings: {report.warnings.join(', ')}
              </div>
            )}

            {report.unassigned?.length > 0 && (
              <details className="rounded-md border bg-muted/30 px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {report.unassigned.length} unassigned files
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {report.unassigned.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="space-y-3">
              {seriesEdits.map((s, idx) => (
                <div key={`${s.dir}-${idx}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap gap-3">
                    <label className="text-xs text-muted-foreground">
                      Number
                      <Input
                        type="number"
                        value={s.number}
                        onChange={(e) => handleSeriesChange(idx, { number: Number(e.target.value) })}
                        className="mt-1 w-24"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Title (optional)
                      <Input
                        value={s.title || ''}
                        onChange={(e) => handleSeriesChange(idx, { title: e.target.value })}
                        className="mt-1 w-64"
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <label className="text-xs text-muted-foreground">
                      PDF
                      <Input
                        value={s.pdf_file || ''}
                        onChange={(e) => handleSeriesChange(idx, { pdf_file: e.target.value })}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      TeX (optional)
                      <Input
                        value={s.tex_file || ''}
                        onChange={(e) => handleSeriesChange(idx, { tex_file: e.target.value })}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Solution (optional)
                      <Input
                        value={s.solution_file || ''}
                        onChange={(e) => handleSeriesChange(idx, { solution_file: e.target.value })}
                        className="mt-1"
                      />
                    </label>
                  </div>
                  {s.issues && s.issues.length > 0 && (
                    <div className="mt-2 text-xs text-destructive">Issues: {s.issues.join(', ')}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                Overwrite/merge into existing fs_path
              </label>
              <Button
                type="button"
                disabled={importing || hasBlockingIssues || !jobId}
                onClick={handleImport}
              >
                {importing ? 'Importing…' : 'Import into Gold Mine'}
              </Button>
              {hasBlockingIssues && (
                <span className="text-xs text-destructive">Fix missing PDFs before importing.</span>
              )}
            </div>

            {importStatus && <div className="text-sm text-muted-foreground">{importStatus}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
