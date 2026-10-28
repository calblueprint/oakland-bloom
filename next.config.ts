import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // readable class names in dev and consistent ones between server and client
  compiler: { styledComponents: true },
};

export default nextConfig;
