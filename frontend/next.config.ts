import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    BACKEND_URL: process.env.BACKEND_URL || "https://autopost-2s7o.onrender.com",
  },
};

export default nextConfig;
