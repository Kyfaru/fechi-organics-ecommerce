import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cacheComponents: true,
  },
  
  serverExternalPackages: [
    "@better-auth/kysely-adapter",
    "@prisma/client",
    "prisma",
  ],
  images: {
    remotePatterns: [
      // Figma Desktop MCP asset server (dev only)
      {
        protocol: "http",
        hostname: "localhost",
        port: "3845",
        pathname: "/assets/**",
      },
      // Cloudflare R2 public bucket
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
