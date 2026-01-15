const DEFAULT_API_BASE =
    process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000/api";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;

export function getApiBase() {
    return BASE_URL;
}

type FetchOptions = RequestInit & {
    params?: Record<string, string>;
};

function getCookie(name: string): string | undefined {
    if (typeof document === "undefined") return undefined;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift();
}

export async function apiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${BASE_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams(params);
        url += `?${searchParams.toString()}`;
    }

    const headers = new Headers(fetchOptions.headers);
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const method = (fetchOptions.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const csrf = getCookie("csrftoken");
        if (csrf) headers.set("X-CSRFToken", csrf);
    }

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const response = await fetch(url, {
        credentials: "include", // Essential for HttpOnly cookies
        headers,
        ...fetchOptions,
    });
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duration = Math.round(end - start);
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production" && duration > 1500) {
        console.warn(`[api] ${method} ${endpoint} took ${duration}ms`);
    }

    if (!response.ok) {
        // Attempt to parse error message
        let errorMessage = response.statusText;
        try {
            const errorData = await response.json();
            if (errorData.message) errorMessage = errorData.message;
        } catch {
            // ignore JSON parse error
        }
        throw new Error(errorMessage || `Request failed with status ${response.status}`);
    }

    if (response.status === 204 || response.status === 205) {
        return undefined as T;
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined as T;
    }
}
