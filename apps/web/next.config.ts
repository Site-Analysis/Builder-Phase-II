import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Windows/OneDrive: redirect distDir to keep output inside workspace tree so
  // node module resolution finds react. Not needed on Linux (Vercel/EC2).
  distDir: process.env.VERCEL ? ".next" : "../../node_modules/.cache/sat-next",
};

export default nextConfig;
