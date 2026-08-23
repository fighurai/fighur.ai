/** Human names for the parts of fighur.ai someone is using. */
export const PLATFORM_AREAS = [
  "Chat",
  "Settings",
  "Account",
  "Connectors",
  "Agents",
  "Tasks",
  "Apps",
  "Skills",
  "Deep Research",
  "Extension",
  "MCP",
  "Sign in",
  "Sign up",
  "Upgrade",
  "Legal",
  "Support",
  "Hosted app",
  "Admin",
] as const;

export type PlatformArea = (typeof PLATFORM_AREAS)[number];

const SETTINGS_TABS: Record<string, PlatformArea> = {
  account: "Account",
  customize: "Settings",
  research: "Deep Research",
  tasks: "Tasks",
  agents: "Agents",
  skills: "Skills",
  connectors: "Connectors",
  apps: "Apps",
  extension: "Extension",
  mcp: "MCP",
};

function pathAndQuery(path?: string, search?: string): { pathname: string; query: URLSearchParams } {
  const raw = `${path || "/"}${search && !path?.includes("?") ? search : ""}`;
  const qIndex = raw.indexOf("?");
  const pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).split("#")[0] || "/";
  const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : (search || "").replace(/^\?/, ""));
  return { pathname, query };
}

export function resolvePlatformArea(input: {
  path?: string;
  search?: string;
  action?: string;
}): PlatformArea {
  if (input.action === "chat.request") return "Chat";
  if (input.action === "auth.sign_up") return "Sign up";
  if (input.action === "auth.sign_in" || input.action === "auth.sign_in_sso") return "Sign in";
  if (input.action === "billing.upgrade") return "Upgrade";

  const { pathname, query } = pathAndQuery(input.path, input.search);
  if (pathname === "/chat") return "Chat";
  if (pathname === "/" || pathname === "") return "Chat";
  if (pathname.startsWith("/settings")) {
    const tab = (query.get("tab") || "").toLowerCase();
    return SETTINGS_TABS[tab] || "Settings";
  }
  if (pathname.startsWith("/sign-in")) return "Sign in";
  if (pathname.startsWith("/sign-up")) return "Sign up";
  if (pathname.startsWith("/upgrade")) return "Upgrade";
  if (pathname.startsWith("/extension")) return "Extension";
  if (pathname.startsWith("/support")) return "Support";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/a/")) return "Hosted app";
  if (
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/eula") ||
    pathname.startsWith("/legal")
  ) {
    return "Legal";
  }
  return "Chat";
}

export function mergeAreaCounts(
  a?: Record<string, number>,
  b?: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  if (!b) return out;
  for (const [key, n] of Object.entries(b)) {
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}
