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
import { getApiBase, apiFetch } from '@/lib/api';
import { mutate } from 'swr';

type LectureCreateDialogProps = {
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function LectureCreateDialog({
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: LectureCreateDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [longName, setLongName] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !longName) {
            setError('Name and Long Name are required');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await apiFetch('/lectures', {
                method: 'POST',
                body: JSON.stringify({ name, long_name: longName }),
            });

            setOpen(false);
            setName('');
            setLongName('');

            mutate('/lectures');

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
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Lecture</DialogTitle>
                    <DialogDescription>
                        Add a new lecture to the system.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {error && (
                        <div className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            Short Name
                        </Label>
                        <Input
                            id="name"
                            className="col-span-3"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. QM1"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="longName" className="text-right">
                            Long Name
                        </Label>
                        <Input
                            id="longName"
                            className="col-span-3"
                            value={longName}
                            onChange={(e) => setLongName(e.target.value)}
                            placeholder="e.g. Quantum Mechanics 1"
                            required
                        />
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Creating...' : 'Create Lecture'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
