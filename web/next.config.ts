import type { NextConfig } from "next";
import path from "path";

const apiUrl = process.env.API_URL || "http://localhost:4001";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
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
