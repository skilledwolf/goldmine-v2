"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
    Search,
    FileText,
    Home,
    Laptop,
    Check,
    BookOpen
} from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

type SearchResult = {
    lectures: Array<{ id: number; name: string; long_name: string }>;
    series: Array<{ id: number; number: number; title: string; lecture_name: string; year: number; semester: string }>;
    exercises: Array<{ id: number; number: number; title: string; series_id: number; series_number: number; lecture_name: string }>;
};

export function CommandMenu() {
    const [open, setOpen] = React.useState(false);
    const router = useRouter();

    const [query, setQuery] = React.useState("");
    const debouncedQuery = useDebouncedValue(query, 300);
    const [loading, setLoading] = React.useState(false);
    const [results, setResults] = React.useState<SearchResult | null>(null);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
                if (
                    (e.target instanceof HTMLElement && e.target.isContentEditable) ||
                    e.target instanceof HTMLInputElement ||
                    e.target instanceof HTMLTextAreaElement ||
                    e.target instanceof HTMLSelectElement
                ) {
                    return;
                }

                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    React.useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener('goldmine:open-cmd', handler);
        return () => window.removeEventListener('goldmine:open-cmd', handler);
    }, []);

    React.useEffect(() => {
        if (!debouncedQuery) {
            setResults(null);
            return;
        }

        async function fetchResults() {
            setLoading(true);
            try {
                const data = await apiFetch<SearchResult>('/search', { params: { q: debouncedQuery } });
                setResults(data);
            } catch {
                setResults(null);
            } finally {
                setLoading(false);
            }
        }

        fetchResults();
    }, [debouncedQuery]);

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            shouldFilter={false}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg rounded-xl border border-border/40 bg-popover/80 backdrop-blur-xl shadow-2xl overflow-hidden z-[50] animate-in fade-in zoom-in-95 duration-200"
        >
            <Dialog.Title className="sr-only">Command Menu</Dialog.Title>
            <div className="flex items-center border-b px-3 h-14">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Type a command or search lectures..."
                />
                {loading && <div className="h-4 w-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin flex-shrink-0" />}
            </div>
            <Command.List className="max-h-[350px] overflow-y-auto overflow-x-hidden py-2 px-2 scroll-py-2 custom-scrollbar">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    {query ? 'No results found.' : 'Search for anything...'}
                </Command.Empty>

                {!query && (
                    <>
                        <Command.Group heading="Suggestions" className="text-xs font-medium text-muted-foreground px-2 mb-2">
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/"))}
                                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                            >
                                <Home className="mr-2 h-4 w-4" />
                                <span>Home</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/lectures"))}
                                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                            >
                                <Laptop className="mr-2 h-4 w-4" />
                                <span>Lectures</span>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push("/search"))}
                                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                            >
                                <Search className="mr-2 h-4 w-4" />
                                <span>Search</span>
                            </Command.Item>
                        </Command.Group>

                        <Command.Separator className="my-1 h-px bg-border/50" />

                        
                    </>
                )}

                {query && results && (
                    <>
                        {results.lectures.length > 0 && (
                            <Command.Group heading="Lectures" className="text-xs font-medium text-muted-foreground px-2 mb-2">
                                {results.lectures.map((l) => (
                                    <Command.Item
                                        key={`lec-${l.id}`}
                                        onSelect={() => runCommand(() => router.push(`/lectures/${l.id}`))}
                                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                    >
                                        <BookOpen className="mr-2 h-4 w-4 opacity-70" />
                                        <div className="flex flex-col">
                                            <span className="font-medium">{l.long_name}</span>
                                            <span className="text-[10px] text-muted-foreground">{l.name}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.series.length > 0 && (
                            <Command.Group heading="Series" className="text-xs font-medium text-muted-foreground px-2 mb-2">
                                {results.series.map((s) => (
                                    <Command.Item
                                        key={`series-${s.id}`}
                                        onSelect={() => runCommand(() => router.push(`/series/${s.id}`))}
                                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                    >
                                        <FileText className="mr-2 h-4 w-4 opacity-70" />
                                        <div className="flex flex-col">
                                            <span className="font-medium">Series {s.number} {s.title ? `- ${s.title}` : ''}</span>
                                            <span className="text-[10px] text-muted-foreground">{s.lecture_name} • {s.semester}{s.year}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {results.exercises.length > 0 && (
                            <Command.Group heading="Exercises" className="text-xs font-medium text-muted-foreground px-2 mb-2">
                                {results.exercises.map((ex) => (
                                    <Command.Item
                                        key={`ex-${ex.id}`}
                                        onSelect={() => runCommand(() => router.push(`/series/${ex.series_id}#exercise-${ex.id}`))}
                                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                    >
                                        <Check className="mr-2 h-4 w-4 opacity-70" />
                                        <div className="flex flex-col">
                                            <span className="font-medium">Exercise {ex.number}: {ex.title || 'Untitled'}</span>
                                            <span className="text-[10px] text-muted-foreground">{ex.lecture_name} • Series {ex.series_number}</span>
                                        </div>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}
                    </>
                )}

            </Command.List>

            <div className="border-t py-2 px-4 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/20">
                <span>Use <kbd className="font-sans bg-muted/50 px-1 rounded">↑</kbd> <kbd className="font-sans bg-muted/50 px-1 rounded">↓</kbd> to navigate</span>
                <span><kbd className="font-sans bg-muted/50 px-1 rounded">Enter</kbd> to select</span>
            </div>
        </Command.Dialog>
    );
}
