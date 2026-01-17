'use client';

import { useMemo, useState, useEffect } from 'react';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, UserPlus, Users, GraduationCap } from 'lucide-react';

type User = {
    id: number;
    username: string;
};

type Membership = {
    id: number;
    user: User;
    role: 'professor' | 'assistant';
    created_at: string;
};

type Lecture = {
    id: number;
    name: string;
    long_name: string;
    semester_groups: {
        id: number;
        year: number;
        semester: string;
    }[];
};

export default function StaffingPage() {
    const crumbs = useMemo(() => [
        { label: 'Dashboard', href: '/' },
        { label: 'Staffing', href: '/staffing', isCurrent: true },
    ], []);
    useBreadcrumbs(crumbs);

    const { data: lectures } = useApiSWR<Lecture[]>('/lectures');
    const { data: allUsers } = useApiSWR<User[]>('/users');

    const [selectedGroupId, setSelectedGroupId] = useState<string>('');
    const [selectedUserToAdd, setSelectedUserToAdd] = useState<string>('');
    const [roleToAdd, setRoleToAdd] = useState<string>('assistant');
    const [loading, setLoading] = useState(false);

    // Automatically select the first available semester group if none selected
    useEffect(() => {
        if (!selectedGroupId && lectures && lectures.length > 0) {
            const firstGroup = lectures[0].semester_groups[0];
            if (firstGroup) setSelectedGroupId(String(firstGroup.id));
        }
    }, [lectures, selectedGroupId]);

    const { data: memberships, mutate: mutateMemberships } = useApiSWR<Membership[]>(
        selectedGroupId ? `/users/memberships/${selectedGroupId}` : null
    );

    const handleAddMember = async () => {
        if (!selectedGroupId || !selectedUserToAdd) return;
        setLoading(true);
        try {
            await apiFetch(`/users/memberships/${selectedGroupId}`, {
                method: 'POST',
                body: JSON.stringify({
                    user_id: Number(selectedUserToAdd),
                    role: roleToAdd
                })
            });
            await mutateMemberships();
            setSelectedUserToAdd('');
        } catch (e) {
            console.error("Failed to add member", e);
            alert("Failed to add member. They might already be added.");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (userId: number) => {
        if (!confirm("Are you sure you want to remove this user?")) return;
        try {
            await apiFetch(`/users/memberships/${selectedGroupId}/${userId}`, {
                method: 'DELETE'
            });
            await mutateMemberships();
        } catch (e) {
            console.error("Failed to remove member", e);
        }
    };

    const selectedGroupLabel = useMemo(() => {
        if (!lectures || !selectedGroupId) return '';
        for (const lec of lectures) {
            const group = lec.semester_groups.find(g => String(g.id) === selectedGroupId);
            if (group) return `${lec.name} ${group.semester}${group.year}`;
        }
        return '';
    }, [lectures, selectedGroupId]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="border-b border-border/50 pb-6">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Staff Area</p>
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-600 bg-clip-text text-transparent">
                    Staffing Management
                </h1>
                <p className="text-muted-foreground mt-2">
                    Assign Professors and Assistants to specific semester courses.
                </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Select Course</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {lectures?.map(lecture => (
                                <div key={lecture.id} className="space-y-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase">{lecture.name}</div>
                                    <div className="space-y-1">
                                        {lecture.semester_groups.map(group => (
                                            <button
                                                key={group.id}
                                                onClick={() => setSelectedGroupId(String(group.id))}
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${selectedGroupId === String(group.id)
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'hover:bg-muted text-muted-foreground'
                                                    }`}
                                            >
                                                <span>{group.semester}{group.year}</span>
                                                {selectedGroupId === String(group.id) && <div className="h-2 w-2 rounded-full bg-primary" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Staff List</CardTitle>
                                <CardDescription>Members of {selectedGroupLabel}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!memberships ? (
                                <div className="text-sm text-muted-foreground">Select a course to view staff.</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {memberships.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                                    No staff assigned to this course yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {memberships.map((m) => (
                                            <TableRow key={m.id}>
                                                <TableCell className="font-medium flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                                        <span className="text-xs">{m.user.username.substring(0, 2).toUpperCase()}</span>
                                                    </div>
                                                    {m.user.username}
                                                </TableCell>
                                                <TableCell>
                                                    {m.role === 'professor' ? (
                                                        <Badge variant="default" className="bg-indigo-500 hover:bg-indigo-600">
                                                            <GraduationCap className="w-3 h-3 mr-1" /> Professor
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary">
                                                            <Users className="w-3 h-3 mr-1" /> Assistant
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleRemoveMember(m.user.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <UserPlus className="h-5 w-5" /> Add Staff
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="space-y-1.5 flex-1 w-full">
                                    <label className="text-xs font-medium text-muted-foreground">User</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={selectedUserToAdd}
                                        onChange={(e) => setSelectedUserToAdd(e.target.value)}
                                    >
                                        <option value="" disabled>Select a user...</option>
                                        {allUsers?.map(u => (
                                            <option key={u.id} value={u.id}>{u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5 w-full sm:w-[150px]">
                                    <label className="text-xs font-medium text-muted-foreground">Role</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={roleToAdd}
                                        onChange={(e) => setRoleToAdd(e.target.value)}
                                    >
                                        <option value="professor">Professor</option>
                                        <option value="assistant">Assistant</option>
                                    </select>
                                </div>
                                <Button onClick={handleAddMember} disabled={loading || !selectedUserToAdd}>
                                    {loading ? 'Adding...' : 'Add Member'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
