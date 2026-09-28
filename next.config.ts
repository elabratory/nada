import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary relative to its own package folder,
  // so it must not be bundled by the server compiler.
  serverExternalPackages: ["ffmpeg-static"],
  // Don't let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
};

export default nextConfig;
