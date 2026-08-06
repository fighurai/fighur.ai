import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk", "eventsource"],
};

export default nextConfig;
