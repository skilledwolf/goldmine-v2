import type { NextConfig } from "next";

const apiProxyHostport = process.env.API_PROXY_HOSTPORT;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiProxyHostport) return [];

    const target = `http://${apiProxyHostport}`;

    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/admin/:path*", destination: `${target}/admin/:path*` },
      { source: "/media/:path*", destination: `${target}/media/:path*` },
      { source: "/static/:path*", destination: `${target}/static/:path*` },
    ];
  },
};

export default nextConfig;
