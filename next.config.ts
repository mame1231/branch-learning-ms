import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/kuromoji/dict/**"],
  },
};

export default nextConfig;
