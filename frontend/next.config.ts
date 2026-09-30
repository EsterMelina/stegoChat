import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  experimental: { proxyClientMaxBodySize: "25mb" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL || "http://127.0.0.1:8001"}/api/:path*` }];
  },
};
export default config;
