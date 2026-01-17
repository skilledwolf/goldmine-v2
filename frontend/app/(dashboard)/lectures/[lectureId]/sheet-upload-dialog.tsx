'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiBase } from '@/lib/api';
import { mutate } from 'swr';

type SheetUploadDialogProps = {
    semesterGroupId: number;
    lectureId: number;
    seriesId?: number;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    initialNumber?: number;
    initialTitle?: string;
    mode?: 'create' | 'edit' | 'replace';
};

export function SheetUploadDialog({
    semesterGroupId,
    lectureId,
    seriesId,
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    initialNumber,
    initialTitle = '',
    mode = 'create',
}: SheetUploadDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [number, setNumber] = useState<number | ''>(initialNumber || '');
    const [title, setTitle] = useState(initialTitle);
    const [texFile, setTexFile] = useState<File | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [solutionFile, setSolutionFile] = useState<File | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!number) {
            setError('Series number is required');
            return;
        }
        const isReplace = mode === 'replace' || mode === 'edit';
        if (isReplace && !seriesId) {
            setError('Series identifier missing for replacement.');
            return;
        }
        if (isReplace && !texFile && !pdfFile && !solutionFile) {
            setError('Select at least one file to replace.');
            return;
        }

        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        if (title) formData.append('title', title);
        if (texFile) formData.append('tex', texFile);
        if (pdfFile) formData.append('pdf', pdfFile);
        if (solutionFile) formData.append('solution', solutionFile);

        try {
            const apiBase = getApiBase();
            const endpoint = isReplace
                ? `${apiBase}/series-mgmt/series/${seriesId}/replace`
                : `${apiBase}/series-mgmt/semester_groups/${semesterGroupId}/series/${number}/upload`;
            const res = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                // Content-Type header is set automatically by browser with boundary for FormData
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Upload failed');
            }

            setOpen(false);
            // Reset form
            setNumber('');
            setTitle('');
            setTexFile(null);
            setPdfFile(null);
            setSolutionFile(null);

            // Refresh the lecture data
            mutate(lectureId ? `/lectures/${lectureId}` : null);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'An error occurred during upload');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{mode === 'replace' || mode === 'edit' ? 'Replace Sheet' : 'Upload Sheet'}</DialogTitle>
                    <DialogDescription>
                        {mode === 'replace' || mode === 'edit'
                            ? 'Upload new files to replace the existing sheet. The previous version is archived for recovery.'
                            : 'Upload files for a specific exercise sheet.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {error && (
                        <div className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="number" className="text-right">
                            Number
                        </Label>
                        <Input
                            id="number"
                            type="number"
                            className="col-span-3"
                            value={number}
                            onChange={(e) => setNumber(e.target.valueAsNumber)}
                            required
                            min={1}
                            disabled={mode === 'edit' || mode === 'replace'}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right">
                            Title
                        </Label>
                        <Input
                            id="title"
                            className="col-span-3"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="(Optional)"
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="pdf" className="text-right">
                            PDF
                        </Label>
                        <Input
                            id="pdf"
                            type="file"
                            accept=".pdf"
                            className="col-span-3 cursor-pointer"
                            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="solution" className="text-right">
                            Solution
                        </Label>
                        <Input
                            id="solution"
                            type="file"
                            accept=".pdf"
                            className="col-span-3 cursor-pointer"
                            onChange={(e) => setSolutionFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="tex" className="text-right">
                            TeX
                        </Label>
                        <Input
                            id="tex"
                            type="file"
                            accept=".tex"
                            className="col-span-3 cursor-pointer"
                            onChange={(e) => setTexFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Uploading...' : mode === 'replace' || mode === 'edit' ? 'Replace' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
