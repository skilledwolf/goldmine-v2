'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

	type UploadReport = {
	    root: string;
	    series: unknown[];
	    unassigned: string[];
	    warnings: string[];
	};

type UploadJob = {
    id: number;
    status: string;
    fs_path: string;
    created_at?: string;
    report: UploadReport;
};

export default function UploadsListPage() {
    const crumbs = useMemo(() => [
        { label: 'Dashboard', href: '/' },
        { label: 'Uploads', href: '/uploads', isCurrent: true },
    ], []);
    useBreadcrumbs(crumbs);

    const { data: jobs, error } = useApiSWR<UploadJob[]>('/uploads');

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-border/50 pb-6">
                <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff Area</p>
                    <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                        Upload History
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Manage and monitor past bulk uploads.
                    </p>
                </div>
                <Link href="/uploads/new">
                    <Button className="gap-2 shadow-lg hover:shadow-xl transition-all">
                        <Plus className="h-4 w-4" /> New Upload
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Uploads</CardTitle>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <div className="text-destructive">Failed to load uploads.</div>
                    ) : !jobs ? (
                        <div className="text-muted-foreground">Loading...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Target Path</TableHead>
                                    <TableHead>Series</TableHead>
                                    <TableHead className="text-right">Issues</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map((job) => (
                                    <TableRow key={job.id} className="group hover:bg-muted/50">
                                        <TableCell className="font-medium">#{job.id}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    job.status === 'imported'
                                                        ? 'success'
                                                        : job.status === 'failed'
                                                            ? 'destructive'
                                                            : 'secondary'
                                                }
                                            >
                                                {job.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {job.fs_path}
                                        </TableCell>
                                        <TableCell>
                                            {job.report?.series?.length || 0}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(job.report?.warnings?.length || 0) > 0 ? (
                                                <Badge variant="warning">{job.report.warnings.length} warnings</Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {jobs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No upload jobs found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
