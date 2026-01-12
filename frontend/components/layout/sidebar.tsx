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

    return (
        <div
            className={cn(
                "flex h-screen flex-col justify-between border-r bg-card py-4 transition-all duration-200",
                collapsed ? "w-16 px-2" : "w-64 px-3"
            )}
        >
            <div className="space-y-6">
                <div className={cn("flex items-center", collapsed ? "justify-center px-2" : "px-4")}>
                    <Mountain className="h-6 w-6 text-primary" />
                    {!collapsed && (
                        <span className="ml-2 text-lg font-bold tracking-tight">Gold Mine V2</span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className={cn("ml-auto", collapsed && "ml-0")}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        onClick={() => setCollapsed((value) => !value)}
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>

                <nav className="space-y-1">
                    {sidebarItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                                pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                                    : "text-muted-foreground",
                                collapsed && "justify-center px-2"
                            )}
                            title={collapsed ? item.name : undefined}
                        >
                            <item.icon className={cn("h-5 w-5", !collapsed && "mr-3")} />
                            {!collapsed && <span>{item.name}</span>}
                            {collapsed && <span className="sr-only">{item.name}</span>}
                        </Link>
                    ))}
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
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            collapsed && "justify-center px-2"
                        )}
                        asChild
                        title={collapsed ? "Uploads" : undefined}
                    >
                        <Link href="/uploads">
                            <UploadCloud className={cn("h-5 w-5", !collapsed && "mr-3")} />
                            {!collapsed && "Uploads"}
                            {collapsed && <span className="sr-only">Uploads</span>}
                        </Link>
                    </Button>
                )}
                {isStaff && (
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            collapsed && "justify-center px-2"
                        )}
                        asChild
                        title={collapsed ? "Issues" : undefined}
                    >
                        <Link href="/issues">
                            <Shield className={cn("h-5 w-5", !collapsed && "mr-3")} />
                            {!collapsed && "Issues"}
                            {collapsed && <span className="sr-only">Issues</span>}
                        </Link>
                    </Button>
                )}
                {isStaff && (
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            collapsed && "justify-center px-2"
                        )}
                        asChild
                        title={collapsed ? "Backend admin" : undefined}
                    >
                        <a href={adminHref} target="_blank" rel="noreferrer">
                            <Shield className={cn("h-5 w-5", !collapsed && "mr-3")} />
                            {!collapsed && "Backend admin"}
                            {collapsed && <span className="sr-only">Backend admin</span>}
                        </a>
                    </Button>
                )}
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
    );
}
