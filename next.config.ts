import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pins the workspace root explicitly — otherwise Turbopack walks up and
  // can pick up an unrelated lockfile in a parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
  // Next's dev server rejects requests whose Host doesn't match an allowed origin (DNS-rebinding
  // protection) — "host.docker.internal" is how the playwright Docker service reaches this dev
  // server (see docker-compose.yml); without it, HMR/RSC requests over that hostname silently
  // fail and break hydration, so e2e specs would see a plain, un-interactive page.
  allowedDevOrigins: ["host.docker.internal"],
};

export default nextConfig;
