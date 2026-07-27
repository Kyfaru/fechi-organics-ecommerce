import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  cacheComponents: true,

  transpilePackages: ['d3-array', 'react-simple-maps'],

  serverExternalPackages: [
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
        hostname: "*.cloudflarestorage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      // If using a custom domain for R2, add it here:
      // { protocol: "https", hostname: "your-r2-custom-domain.com", pathname: "/**" },
      {
        protocol: "https",
        hostname: "flagcdn.com",
        pathname: "/**",
      },
      // Google OAuth profile avatars
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
