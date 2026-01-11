import { cookies } from 'next/headers';

const BASE_URL = process.env.INTERNAL_API_URL || "http://backend:8000/api";

export async function apiFetchServer<T>(endpoint: string): Promise<T> {
    const cookieStore = await cookies();
    const sessionid = cookieStore.get('sessionid');
    const csrftoken = cookieStore.get('csrftoken');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (sessionid) {
        // Construct Cookie header manually
        const cookieParts = [];
        if (sessionid) cookieParts.push(`sessionid=${sessionid.value}`);
        if (csrftoken) cookieParts.push(`csrftoken=${csrftoken.value}`);
        headers['Cookie'] = cookieParts.join('; ');
    }

    // Use fetch directly. 
    // Next.js extends fetch to allow caching configuration.
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers,
        cache: 'no-store', // Always fetch fresh data for now
    });

    if (!res.ok) {
        // If 401, we might let the caller handle it or throw
        if (res.status === 401) {
            throw new Error('Unauthorized');
        }
        throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
    }

    return res.json();
}
