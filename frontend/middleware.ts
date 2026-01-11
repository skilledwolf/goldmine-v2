import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Check for Django session cookie
    // Note: Session ID name depends on Django settings, default is 'sessionid'
    const session = request.cookies.get('sessionid');
    const isLoginPage = request.nextUrl.pathname === '/login';

    // Define public paths that don't need authentication
    const isPublicPath =
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.startsWith('/static') ||
        request.nextUrl.pathname.startsWith('/api') || // Proxy API requests? (Depends on setup)
        isLoginPage;

    if (!session && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (session && isLoginPage) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
