import useSWR from 'swr';
import { apiFetch } from './api';

export type User = {
	    id: number;
	    username: string;
	    email: string;
	    is_staff: boolean;
	    is_professor: boolean;
	};

export function useAuth() {
	    const { data: user, error, isLoading, mutate } = useSWR<User | null>('/auth/me', async (url: string) => {
	        try {
	            return await apiFetch<User>(url);
	        } catch {
	            // If 401, return null user instead of throwing
	            return null;
	        }
	    });

    const isAuthenticated = !!user && !error;

    return {
        user,
        error,
        isLoading,
        isAuthenticated,
        isStaff: user?.is_staff ?? false,
        isProfessor: user?.is_professor ?? false,
        mutate
    };
}
