import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary relative to its own package folder,
  // so it must not be bundled by the server compiler.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
