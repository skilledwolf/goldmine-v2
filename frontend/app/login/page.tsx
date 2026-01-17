'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, User } from 'lucide-react';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/toast';

export default function LoginPage() {
    const router = useRouter();
    const { pushToast } = useToast();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Ensure CSRF cookie exists before first POST
        apiFetch('/auth/csrf').catch(() => {
            /* ignore; middleware should still set token on next request */
        });
        document.title = 'Login · Gold Mine V2';
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            pushToast({ title: 'Signed in', tone: 'success' });
            router.push('/');
            router.refresh(); // Refresh to update middleware/server state
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            setError(message);
            pushToast({ title: 'Login failed', description: message, tone: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
            {/* Animated Cosmic Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute -left-[10%] -top-[10%] h-[50vw] w-[50vw] rounded-full bg-primary/20 blur-[120px] filter animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute -right-[10%] -bottom-[10%] h-[50vw] w-[50vw] rounded-full bg-indigo-500/20 blur-[120px] filter animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }} />
            </div>

            <Card className="relative z-10 w-full max-w-md border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
                <CardHeader className="space-y-1 text-center">
                    <div className="mb-4 flex justify-center">
                        <div className="rounded-full bg-primary/20 p-3 ring-1 ring-primary/50">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Welcome Back
                    </CardTitle>
                    <CardDescription className="text-base">
                        Enter your credentials to access Gold Mine.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium border border-destructive/20">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative group">
                                <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                    id="username"
                                    placeholder="Enter your username"
                                    type="text"
                                    className="pl-10 bg-black/5 border-white/10 focus-visible:ring-primary h-11 transition-all"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                    id="password"
                                    placeholder="••••••••"
                                    type="password"
                                    className="pl-10 bg-black/5 border-white/10 focus-visible:ring-primary h-11 transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="pt-4">
                        <Button 
                            className="w-full h-11 text-base font-medium shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" 
                            type="submit" 
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
