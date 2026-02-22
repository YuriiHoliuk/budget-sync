// Next.js configuration for Budget Sync web app
import type { NextConfig } from "next";
import path from "path";

const apiUrl = process.env.API_URL || "http://localhost:4001";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  // Track files in parent directory for monorepo support
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Use polling for file watching in Docker dev to avoid partial file read errors
  ...(isDev && {
    webpack: (config) => {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
      return config;
    },
  }),
  async rewrites() {
    return [
      {
        source: "/api/graphql",
        destination: `${apiUrl}/graphql`,
      },
    ];
  },
};

export default nextConfig;
