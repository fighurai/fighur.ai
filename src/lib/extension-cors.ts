import type { NextRequest } from "next/server";

/**
 * Allow credentialed calls from the FIGHURAI Chrome extension popup
 * (chrome-extension://…) and same-site origins.
 */
export function extensionCorsHeaders(request: NextRequest | Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed =
    origin.startsWith("chrome-extension://") ||
    origin === "https://fighur.ai" ||
    origin === "https://www.fighur.ai" ||
    origin === "https://fighurai.ai" ||
    origin === "https://www.fighurai.ai" ||
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000";

  if (!allowed) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
