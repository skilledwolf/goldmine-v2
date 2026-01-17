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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { mutate } from 'swr';

type SemesterCreateDialogProps = {
    lectureId: number;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function SemesterCreateDialog({
    lectureId,
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: SemesterCreateDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear.toString());
    const [semester, setSemester] = useState('HS');
    const [professors, setProfessors] = useState('');
    const [assistants, setAssistants] = useState('');
    const [fsPath, setFsPath] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!year || !semester) {
            setError('Year and Semester are required');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await apiFetch(`/lectures/${lectureId}/semester_groups`, {
                method: 'POST',
                body: JSON.stringify({
                    year: parseInt(year),
                    semester,
                    professors,
                    assistants,
                    fs_path: fsPath
                }),
            });

            setOpen(false);
            // Reset form defaults 
            // (year and semester kept as likely user wants to add similar or next)

            mutate(`/lectures/${lectureId}`);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Semester</DialogTitle>
                    <DialogDescription>
                        Create a new semester instance for this lecture.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {error && (
                        <div className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="year">Year</Label>
                            <Input
                                id="year"
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="semester">Semester</Label>
                            <Select value={semester} onValueChange={setSemester}>
                                <SelectTrigger id="semester">
                                    <SelectValue placeholder="Select semester" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="HS">HS (Autumn)</SelectItem>
                                    <SelectItem value="FS">FS (Spring)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="professors">Professors (one per line)</Label>
                        <Input
                            id="professors"
                            value={professors}
                            onChange={(e) => setProfessors(e.target.value)}
                            placeholder="e.g. Einstein"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="assistants">Assistants (one per line)</Label>
                        <Input
                            id="assistants"
                            value={assistants}
                            onChange={(e) => setAssistants(e.target.value)}
                            placeholder="e.g. Bohr"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="fsPath">Filesystem Path (optional)</Label>
                        <Input
                            id="fsPath"
                            value={fsPath}
                            onChange={(e) => setFsPath(e.target.value)}
                            placeholder="e.g. 2024/HS"
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Relative to lecture media root. Leave blank to default.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Creating...' : 'Create Semester'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
