import type { NextConfig } from "next";
import path from "node:path";

// Unlike bookmark favicons/OG images (arbitrary third-party URLs discovered at runtime — see
// components/bookmarks/bookmark-view.tsx's plain-<img> rationale), our own Supabase Storage host
// is known at build/deploy time from this environment's own config, so it genuinely can be
// allowlisted here and get real next/image resizing ("thumbnails ... resized on the fly" per
// docs/01_MVP/File_Uploads.md) instead of the <img> workaround.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

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
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
