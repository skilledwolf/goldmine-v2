'use client';

import { useMemo } from 'react';
import { useApiSWR } from '@/lib/swr';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, User as UserIcon } from 'lucide-react';

type User = {
    id: number;
    username: string;
    email: string;
    is_staff: boolean;
};

export default function UsersPage() {
    const crumbs = useMemo(() => [
        { label: 'Dashboard', href: '/' },
        { label: 'Users', href: '/users', isCurrent: true },
    ], []);
    useBreadcrumbs(crumbs);

    const { data: users, error } = useApiSWR<User[]>('/users');

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="border-b border-border/50 pb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff Area</p>
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-600 bg-clip-text text-transparent">
                    User Directory
                </h1>
                <p className="text-muted-foreground mt-2">
                    View all registered users in the system.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Users</CardTitle>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <div className="text-destructive">Failed to load users. Are you staff?</div>
                    ) : !users ? (
                        <div className="text-muted-foreground">Loading...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id} className="group hover:bg-muted/50">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            #{user.id}
                                        </TableCell>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <UserIcon className="h-4 w-4" />
                                            </div>
                                            {user.username}
                                        </TableCell>
                                        <TableCell>{user.email || <span className="text-muted-foreground">-</span>}</TableCell>
                                        <TableCell className="text-right">
                                            {user.is_staff ? (
                                                <Badge className="bg-purple-500 hover:bg-purple-600 gap-1">
                                                    <Shield className="h-3 w-3" /> Staff
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">User</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
