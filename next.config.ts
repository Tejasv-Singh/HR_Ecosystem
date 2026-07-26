import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Prisma client and the `pg` driver are Node-only; keep them out of the
  // bundler's module graph so server components/route handlers load them natively.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

  // Dev only. Next treats a request whose Host differs from the dev server's own
  // origin as cross-origin and blocks `/_next/*` dev resources — which silently
  // stalls hydration, because the client sits waiting on an RSC payload that
  // never arrives. The E2E suite drives the app over 127.0.0.1, so allow both
  // loopback spellings.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  experimental: {
    // This project is on TypeScript 7, whose compiler API Next cannot call
    // directly yet. Type checking runs via the `tsc` CLI instead.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
