import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Permit phones using this computer's addresses without allowing arbitrary hosts.
// Restart the dev server after switching networks to refresh this list.
const localDevHosts =
  process.env.NODE_ENV === "development"
    ? Object.values(networkInterfaces())
        .flatMap(addresses => addresses ?? [])
        .filter(address => !address.internal && !address.address.includes("%"))
        .map(address =>
          address.family === "IPv6" ? `[${address.address}]` : address.address,
        )
    : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevHosts,
};

export default nextConfig;
