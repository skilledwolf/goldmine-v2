import type { NextConfig } from "next";

const apiProxyBaseUrl = process.env.API_PROXY_BASE_URL || process.env.API_PROXY_HOSTPORT;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiProxyBaseUrl) return [];

    const target = apiProxyBaseUrl.startsWith("http://") || apiProxyBaseUrl.startsWith("https://")
      ? apiProxyBaseUrl
      : `http://${apiProxyBaseUrl}`;

    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/admin/:path*", destination: `${target}/admin/:path*` },
      { source: "/media/:path*", destination: `${target}/media/:path*` },
      { source: "/static/:path*", destination: `${target}/static/:path*` },
    ];
  },
};

export default nextConfig;
