import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.90.103", "127.0.0.1", "localhost"],
  serverExternalPackages: ["pdfkit"],
  experimental: { serverActions: { bodySizeLimit: "45mb" } },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }
    ] }];
  }
};
export default config;
