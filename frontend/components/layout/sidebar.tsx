'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { apiFetch, getApiBase } from '@/lib/api';
import {
    LayoutDashboard,
    BookOpen,
    LogOut,
    Mountain,
    Search,
    Shield,
    Wand2,
    UploadCloud,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isStaff, setIsStaff] = useState(false);
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem('gm_sidebar_collapsed') === '1';
    });

    useEffect(() => {
        window.localStorage.setItem('gm_sidebar_collapsed', collapsed ? '1' : '0');
    }, [collapsed]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if ((event.metaKey || event.ctrlKey) && key === 'b') {
                event.preventDefault();
                setCollapsed((value) => !value);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadMe = async () => {
            try {
                const me = await apiFetch<{ id: number; username: string; is_staff?: boolean } | { message: string }>(
                    '/auth/me'
                );
                if (!cancelled && !('message' in me)) {
                    setIsStaff(!!me.is_staff);
                }
            } catch {
                if (!cancelled) setIsStaff(false);
            }
        };
        loadMe();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogout = async () => {
        try {
            await apiFetch('/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (error) {
            console.error('Logout failed', error);
            // Force redirect anyway
            router.push('/login');
        }
    };

    const apiBase = getApiBase().replace(/\/$/, '');
    const adminBase = apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase;
    const adminHref = `${adminBase}/admin/`;

    const sidebarItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Lectures', href: '/lectures', icon: BookOpen },
        { name: 'Search', href: '/search', icon: Search },
        // { name: 'Exercises', href: '/exercises', icon: Dumbbell },
        // { name: 'Settings', href: '/settings', icon: Settings },
    ];

    const adminItems = [
        { name: 'Uploads', href: '/uploads', icon: UploadCloud, external: false },
        { name: 'HTML render', href: '/render', icon: Wand2, external: false },
        { name: 'Issues', href: '/issues', icon: Shield, external: false },
        { name: 'Backend admin', href: adminHref, icon: Shield, external: true },
    ] as const;

    return (
        <div
            className={cn(
                "flex h-screen flex-col justify-between border-r border-border/50 bg-sidebar/80 backdrop-blur-md py-4 transition-all duration-300 ease-in-out",
                collapsed ? "w-20 px-2" : "w-72 px-4"
            )}
        >
            <div className="space-y-6">
                <div className={cn("flex items-center", collapsed ? "justify-center" : "px-2")}>
                    <div className="rounded-xl bg-primary/10 p-2">
                        <Mountain className="h-6 w-6 text-primary" />
                    </div>
                    {!collapsed && (
                        <span className="ml-3 text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            Gold Mine
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className={cn("ml-auto hover:bg-primary/10 hover:text-primary", collapsed && "ml-0 absolute -right-3 top-6 z-50 h-6 w-6 rounded-full border bg-background shadow-md")}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        onClick={() => setCollapsed((value) => !value)}
                    >
                        {collapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>

                <nav className="space-y-2">
                    {sidebarItems.map((item) => {
                        const isSearch = item.name === 'Search';

                        if (isSearch) {
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                                        pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        collapsed && "justify-center px-2"
                                    )}
                                    title={collapsed ? "Advanced Search" : undefined}
                                >
                                    <item.icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", !collapsed && "mr-3")} />
                                    {!collapsed && <span className="flex-1">Search</span>}
                                    {!collapsed && (
                                        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded bg-muted/20 px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex text-current">
                                            <span className="text-xs">⌘</span>K
                                        </kbd>
                                    )}
                                    {collapsed && <span className="sr-only">Search</span>}
                                </Link>
                            );
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                                    pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    collapsed && "justify-center px-2"
                                )}
                                title={collapsed ? item.name : undefined}
                            >
                                <item.icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", !collapsed && "mr-3")} />
                                {!collapsed && <span>{item.name}</span>}
                                {collapsed && <span className="sr-only">{item.name}</span>}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className={cn("space-y-1", collapsed ? "px-2" : "px-3")}>
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent/50",
                        collapsed && "justify-center px-2"
                    )}
                    asChild
                    title={collapsed ? "Info" : undefined}
                >
                    <Link href="/info">
                        <Mountain className={cn("h-5 w-5", !collapsed && "mr-3")} />
                        {!collapsed && "Info"}
                        {collapsed && <span className="sr-only">Info</span>}
                    </Link>
                </Button>
                {isStaff && (
                    <div className="border-t border-border/50 pt-3">
                        {!collapsed && (
                            <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                                Administration
                            </div>
                        )}
                        <div className="space-y-1">
                            {adminItems.map((item) => (
                                <Button
                                    key={item.name}
                                    variant="ghost"
                                    className={cn(
                                        "w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent/50",
                                        collapsed && "justify-center px-2"
                                    )}
                                    asChild
                                    title={collapsed ? item.name : undefined}
                                >
                                    {item.external ? (
                                        <a href={item.href} target="_blank" rel="noreferrer">
                                            <item.icon className={cn("h-5 w-5", !collapsed && "mr-3")} />
                                            {!collapsed && item.name}
                                            {collapsed && <span className="sr-only">{item.name}</span>}
                                        </a>
                                    ) : (
                                        <Link href={item.href}>
                                            <item.icon className={cn("h-5 w-5", !collapsed && "mr-3")} />
                                            {!collapsed && item.name}
                                            {collapsed && <span className="sr-only">{item.name}</span>}
                                        </Link>
                                    )}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
                <div className={cn(isStaff && "border-t border-border/50 pt-3")}>
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                            collapsed && "justify-center px-2"
                        )}
                        onClick={handleLogout}
                        title={collapsed ? "Log out" : undefined}
                    >
                        <LogOut className={cn("h-5 w-5", !collapsed && "mr-3")} />
                        {!collapsed && "Log out"}
                        {collapsed && <span className="sr-only">Log out</span>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
