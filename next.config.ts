import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

const config = (phase: string): NextConfig => ({
  ...nextConfig,
  // A production verification build must not replace the running dev server's chunks.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next" : ".next-build",
});

export default config;
