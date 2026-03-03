import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/engines'],
  },
};

export default withSentryConfig(nextConfig, {
  org: "sabimarket",
  project: "sabimarket-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
