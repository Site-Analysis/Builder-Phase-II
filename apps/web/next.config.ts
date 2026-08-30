import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Keep build output inside workspace tree so node module resolution finds react.
  // Next.js 16 on Windows/OneDrive paths redirects distDir to AppData by default,
  // which breaks require('react/jsx-runtime') from the cache location.
  distDir: "../../node_modules/.cache/sat-next",
};

export default nextConfig;
