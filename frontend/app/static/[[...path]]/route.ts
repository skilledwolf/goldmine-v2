import { proxyToBackend } from '@/lib/backend-proxy';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getUpstreamPath(pathSegments?: string[]): string {
  if (!pathSegments || pathSegments.length === 0) return '/static/';
  return `/static/${pathSegments.join('/')}`;
}

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToBackend(request, getUpstreamPath(path));
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToBackend(request, getUpstreamPath(path));
}
