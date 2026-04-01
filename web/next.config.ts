import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "playwright", "yt-dlp-wrap", "googleapis"],
};

export default nextConfig;
