import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@pdf-lib/fontkit"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
