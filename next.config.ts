import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pins the workspace root explicitly — otherwise Turbopack walks up and
  // can pick up an unrelated lockfile in a parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
