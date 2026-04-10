import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverRuntimeConfig: {
    BACKEND_URL: process.env.BACKEND_URL,
  },
};

export default nextConfig;
