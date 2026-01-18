'use client';

import { useMemo, useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

type TrashLecture = {
    id: number;
    name: string;
    long_name: string;
    deleted_at?: string | null;
    deleted_by?: number | null;
    deleted_by_username?: string | null;
};

type TrashSemester = {
    id: number;
    lecture_id: number;
    lecture_name: string;
    year: number;
    semester: string;
    deleted_at?: string | null;
    deleted_by?: number | null;
    deleted_by_username?: string | null;
};

type TrashSeries = {
    id: number;
    semester_group_id: number;
    lecture_id: number;
    lecture_name: string;
    year: number;
    semester: string;
    number: number;
    title?: string;
    replaces_id?: number | null;
    superseded_by_id?: number | null;
    deleted_at?: string | null;
    deleted_by?: number | null;
    deleted_by_username?: string | null;
};

type TrashResponse = {
    lectures: TrashLecture[];
    semesters: TrashSemester[];
    series: TrashSeries[];
};

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

export default function TrashPage() {
    const { data, error, isLoading, mutate } = useApiSWR<TrashResponse>('/trash');
    const [search, setSearch] = useState('');

    const crumbs = useMemo(
        () => [
            { label: 'Dashboard', href: '/' },
            { label: 'Trash', href: '/trash', isCurrent: true },
        ],
        []
    );
    useBreadcrumbs(crumbs);

    const q = search.trim().toLowerCase();
    const lectures = useMemo(
        () =>
            (data?.lectures || []).filter((l) => {
                if (!q) return true;
                const hay = `${l.name} ${l.long_name}`.toLowerCase();
                return hay.includes(q);
            }),
        [data, q]
    );
    const semesters = useMemo(
        () =>
            (data?.semesters || []).filter((s) => {
                if (!q) return true;
                const hay = `${s.lecture_name} ${s.semester}${s.year}`.toLowerCase();
                return hay.includes(q);
            }),
        [data, q]
    );
    const series = useMemo(
        () =>
            (data?.series || []).filter((s) => {
                if (!q) return true;
                const hay = `${s.lecture_name} ${s.semester}${s.year} ${s.title || ''} series ${s.number}`.toLowerCase();
                return hay.includes(q);
            }),
        [data, q]
    );

	    const handleRestore = async (type: 'lectures' | 'semester-groups' | 'series', id: number) => {
	        try {
	            await apiFetch(`/trash/${type}/${id}/restore`, { method: 'POST' });
	            mutate();
	        } catch (err: unknown) {
	            const message = err instanceof Error && err.message ? err.message : 'Failed to restore item';
	            alert(message);
	        }
	    };

	    const handlePurge = async (type: 'lectures' | 'semester-groups' | 'series', id: number) => {
	        const confirmText = 'Permanently delete this item? This cannot be undone.';
	        if (!confirm(confirmText)) return;
	        try {
	            await apiFetch(`/trash/${type}/${id}/purge`, { method: 'POST' });
	            mutate();
	        } catch (err: unknown) {
	            const message = err instanceof Error && err.message ? err.message : 'Failed to purge item';
	            alert(message);
	        }
	    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading trash…</div>;
    }

    if (error) {
        return (
            <div className="space-y-3">
                <div className="text-destructive">Failed to load trash (staff only?).</div>
                <Button size="sm" variant="outline" onClick={() => mutate()}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/50 pb-6">
                <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff only</p>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                            Trash
                        </h1>
                        <div className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
                            {lectures.length + semesters.length + series.length} items
                        </div>
                    </div>
                    <p className="text-muted-foreground mt-2">
                        Restore deleted lectures, semesters, and series or permanently purge them.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full md:w-72 rounded-md border border-input bg-background/50 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        placeholder="Search deleted items..."
                    />
                    <Button size="sm" variant="outline" onClick={() => mutate()} className="gap-2">
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                </div>
            </div>

            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Lectures</h2>
                    <Badge variant="secondary">{lectures.length}</Badge>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Lecture</TableHead>
                                <TableHead>Deleted</TableHead>
                                <TableHead>Deleted by</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lectures.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                        No deleted lectures.
                                    </TableCell>
                                </TableRow>
                            )}
                            {lectures.map((lec) => (
                                <TableRow key={lec.id}>
                                    <TableCell>
                                        <div className="font-medium">{lec.long_name}</div>
                                        <div className="text-xs text-muted-foreground">/{lec.name}</div>
                                    </TableCell>
                                    <TableCell>{formatDate(lec.deleted_at)}</TableCell>
                                    <TableCell>{lec.deleted_by_username || '—'}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleRestore('lectures', lec.id)}>
                                            <RotateCcw className="h-3 w-3" /> Restore
                                        </Button>
                                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => handlePurge('lectures', lec.id)}>
                                            <Trash2 className="h-3 w-3" /> Purge
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Semesters</h2>
                    <Badge variant="secondary">{semesters.length}</Badge>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Semester</TableHead>
                                <TableHead>Deleted</TableHead>
                                <TableHead>Deleted by</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {semesters.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                        No deleted semesters.
                                    </TableCell>
                                </TableRow>
                            )}
                            {semesters.map((sg) => (
                                <TableRow key={sg.id}>
                                    <TableCell>
                                        <div className="font-medium">{sg.lecture_name}</div>
                                        <div className="text-xs text-muted-foreground">{sg.semester}{sg.year}</div>
                                    </TableCell>
                                    <TableCell>{formatDate(sg.deleted_at)}</TableCell>
                                    <TableCell>{sg.deleted_by_username || '—'}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleRestore('semester-groups', sg.id)}>
                                            <RotateCcw className="h-3 w-3" /> Restore
                                        </Button>
                                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => handlePurge('semester-groups', sg.id)}>
                                            <Trash2 className="h-3 w-3" /> Purge
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Series</h2>
                    <Badge variant="secondary">{series.length}</Badge>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Series</TableHead>
                                <TableHead>Deleted</TableHead>
                                <TableHead>Deleted by</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {series.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                        No deleted series.
                                    </TableCell>
                                </TableRow>
                            )}
                            {series.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell>
                                        <div className="font-medium">
                                            {s.lecture_name} · {s.semester}{s.year} · Series {s.number}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {s.title || 'Untitled'}
                                            {s.superseded_by_id && (
                                                <span className="ml-2 text-xs text-amber-600">superseded</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{formatDate(s.deleted_at)}</TableCell>
                                    <TableCell>{s.deleted_by_username || '—'}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleRestore('series', s.id)}>
                                            <RotateCcw className="h-3 w-3" /> Restore
                                        </Button>
                                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => handlePurge('series', s.id)}>
                                            <Trash2 className="h-3 w-3" /> Purge
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>
        </div>
    );
}
