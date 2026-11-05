import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Arena previews run in an iframe; production remains non-embeddable.
  isDevelopment ? "frame-ancestors 'self' https://*.e2b.app" : "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.openstreetmap.org",
  "frame-src https://www.openstreetmap.org",
  "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      // Use CSP alone in development so the Arena preview can embed the app.
      ...(!isDevelopment ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ] }];
  },
};
export default nextConfig;
