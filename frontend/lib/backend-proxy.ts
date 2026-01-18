function getBackendBaseUrl(): string | undefined {
  const baseUrl = process.env.API_PROXY_BASE_URL?.trim();
  if (baseUrl) return baseUrl;

  const hostport = process.env.API_PROXY_HOSTPORT?.trim();
  if (!hostport) return undefined;

  if (hostport.startsWith('http://') || hostport.startsWith('https://')) {
    return hostport;
  }

  return `http://${hostport}`;
}

function buildTargetUrl(request: Request, upstreamPath: string): URL {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('API proxy is not configured (set API_PROXY_BASE_URL or API_PROXY_HOSTPORT)');
  }

  const reqUrl = new URL(request.url);
  const targetUrl = new URL(upstreamPath, baseUrl);
  targetUrl.search = reqUrl.search;
  return targetUrl;
}

export async function proxyToBackend(request: Request, upstreamPath: string): Promise<Response> {
  let targetUrl: URL;
  try {
    targetUrl = buildTargetUrl(request, upstreamPath);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'API proxy is not configured (set API_PROXY_BASE_URL or API_PROXY_HOSTPORT)';
    return Response.json({ message }, { status: 500 });
  }

  const headers = new Headers(request.headers);
  headers.delete('host');

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    cache: 'no-store',
  };
  if (request.body) init.duplex = 'half';

  const upstreamResponse = await fetch(targetUrl, init);

  // Ensure Set-Cookie headers are preserved correctly.
  const responseHeaders = new Headers(upstreamResponse.headers);

  // Strip hop-by-hop and body-encoding headers (Node fetch may transparently decompress).
  for (const header of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-encoding',
    'content-length',
  ]) {
    responseHeaders.delete(header);
  }

  const setCookies =
    typeof upstreamResponse.headers.getSetCookie === 'function' ? upstreamResponse.headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    responseHeaders.delete('set-cookie');
    for (const cookie of setCookies) {
      responseHeaders.append('set-cookie', cookie);
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
