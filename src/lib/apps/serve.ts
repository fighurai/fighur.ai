import type { ManagedApp, ManagedAppFile } from "@/lib/apps/store";

/** Normalize and reject path traversal / unsafe characters. */
export function sanitizeAppFilePath(raw: string): string | null {
  let p = raw.replace(/\\/g, "/").trim();
  p = p.replace(/^\/+/, "");
  if (!p || p.includes("\0") || p.includes("..")) return null;
  if (p.endsWith("/")) p = p.slice(0, -1);
  if (!p || !/^[a-zA-Z0-9._\-/]+$/.test(p)) return null;
  return p.slice(0, 200);
}

export function sanitizeAppFiles(files: ManagedAppFile[]): ManagedAppFile[] {
  const out: ManagedAppFile[] = [];
  const seen = new Set<string>();
  for (const f of files.slice(0, 40)) {
    const path = sanitizeAppFilePath(f.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({ path, content: f.content.slice(0, 200_000) });
  }
  return out;
}

export function findHtmlEntry(files: ManagedAppFile[]): ManagedAppFile | null {
  const normalized = files
    .map((f) => ({ ...f, path: sanitizeAppFilePath(f.path) || f.path }))
    .filter((f) => f.path);
  const index = normalized.find((f) => /(^|\/)index\.html?$/i.test(f.path));
  if (index) return index;
  return normalized.find((f) => /\.html?$/i.test(f.path)) ?? null;
}

export function mimeForAppPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

/** Only serve known static web assets from hosted apps. */
export function isAllowedHostedAsset(filePath: string): boolean {
  return /\.(html?|css|js|mjs|json|svg|txt|md|xml|ico|png|jpe?g|gif|webp|woff2?)$/i.test(
    filePath,
  );
}

export function lookupAppFile(
  app: ManagedApp,
  requestPath: string[],
): ManagedAppFile | null {
  const joined = requestPath.filter(Boolean).join("/");
  const want = sanitizeAppFilePath(joined || "index.html");
  if (!want) return null;

  const files = app.files
    .map((f) => ({ ...f, path: sanitizeAppFilePath(f.path) }))
    .filter((f): f is ManagedAppFile => Boolean(f.path));

  const exact = files.find((f) => f.path === want || f.path === `./${want}`);
  if (exact && isAllowedHostedAsset(exact.path)) return exact;

  // Directory-style: /a/slug/ or /a/slug → index.html
  if (!joined || joined.endsWith("/")) {
    const entry = findHtmlEntry(files);
    if (entry && isAllowedHostedAsset(entry.path)) return entry;
  }

  // Basename fallback (styles.css vs css/styles.css) when unique
  const base = want.split("/").pop()!;
  const matches = files.filter((f) => f.path === base || f.path.endsWith(`/${base}`));
  if (matches.length === 1 && isAllowedHostedAsset(matches[0]!.path)) return matches[0]!;

  return null;
}

export function hostedAppSecurityHeaders(contentType: string): HeadersInit {
  const isHtml = contentType.startsWith("text/html");
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": isHtml ? "public, max-age=60" : "public, max-age=300",
    // Hosted apps are untrusted user HTML — isolate framing; allow common CDN builds.
    "Content-Security-Policy": isHtml
      ? [
          "default-src 'self' https: data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
          "style-src 'self' 'unsafe-inline' https:",
          "img-src 'self' data: https: blob:",
          "font-src 'self' https: data:",
          "connect-src 'self' https:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self' https:",
        ].join("; ")
      : "default-src 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  };
}
