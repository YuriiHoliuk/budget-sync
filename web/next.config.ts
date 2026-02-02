import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  async rewrites() {
    return [
      {
        source: "/api/graphql",
        destination: "http://localhost:4001/graphql",
      },
    ];
  },
};

export default nextConfig;
