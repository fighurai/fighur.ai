/** OpenAI / Cursor-style MCP server map (Settings → MCP). */

export type McpHttpServerConfig = {
  /** Remote MCP endpoint (Streamable HTTP or SSE). */
  url: string;
  headers?: Record<string, string>;
  /** Optional human label; defaults to map key. */
  name?: string;
};

/** Local stdio servers — not runnable on Vercel; stored for future desktop/host. */
export type McpStdioServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  name?: string;
};

export type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig;

export type McpServersConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export function isHttpMcpServer(cfg: McpServerConfig): cfg is McpHttpServerConfig {
  return typeof (cfg as McpHttpServerConfig).url === "string";
}

export function isStdioMcpServer(cfg: McpServerConfig): cfg is McpStdioServerConfig {
  return typeof (cfg as McpStdioServerConfig).command === "string";
}

const MAX_SERVERS = 8;
const MAX_HEADER_KEYS = 12;
const MAX_HEADER_VALUE = 2_000;

function sanitizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_HEADER_KEYS) break;
    if (typeof k !== "string" || typeof v !== "string") continue;
    const key = k.trim().slice(0, 80);
    if (!key) continue;
    out[key] = v.slice(0, MAX_HEADER_VALUE);
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeServerId(id: string): string | null {
  const s = id.trim().slice(0, 48);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)) return null;
  return s;
}

/** Parse and normalize user MCP JSON. Throws Error with message on invalid shape. */
export function parseMcpServersConfig(raw: unknown): McpServersConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error('Config must be an object with "mcpServers".');
  }
  const root = raw as { mcpServers?: unknown };
  if (!root.mcpServers || typeof root.mcpServers !== "object" || Array.isArray(root.mcpServers)) {
    throw new Error('"mcpServers" must be an object.');
  }

  const mcpServers: Record<string, McpServerConfig> = {};
  for (const [rawId, entry] of Object.entries(root.mcpServers as Record<string, unknown>)) {
    if (Object.keys(mcpServers).length >= MAX_SERVERS) break;
    const id = sanitizeServerId(rawId);
    if (!id || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;

    if (typeof e.url === "string" && e.url.trim()) {
      let url: URL;
      try {
        url = new URL(e.url.trim());
      } catch {
        throw new Error(`Server "${id}": invalid url`);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`Server "${id}": url must be http(s)`);
      }
      // Block obvious local/metadata targets on the hosted runtime
      const host = url.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.endsWith(".local") ||
        host.startsWith("169.254.") ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
      ) {
        throw new Error(`Server "${id}": private/local URLs are not allowed on hosted FigHur`);
      }
      mcpServers[id] = {
        url: url.href,
        headers: sanitizeHeaders(e.headers),
        name: typeof e.name === "string" ? e.name.trim().slice(0, 80) : undefined,
      };
      continue;
    }

    if (typeof e.command === "string" && e.command.trim()) {
      mcpServers[id] = {
        command: e.command.trim().slice(0, 200),
        args: Array.isArray(e.args)
          ? e.args.filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200)).slice(0, 20)
          : undefined,
        env:
          e.env && typeof e.env === "object" && !Array.isArray(e.env)
            ? Object.fromEntries(
                Object.entries(e.env as Record<string, unknown>)
                  .filter(([, v]) => typeof v === "string")
                  .slice(0, 20)
                  .map(([k, v]) => [k.slice(0, 80), String(v).slice(0, 2_000)]),
              )
            : undefined,
        name: typeof e.name === "string" ? e.name.trim().slice(0, 80) : undefined,
      };
    }
  }

  return { mcpServers };
}

export function emptyMcpConfig(): McpServersConfig {
  return { mcpServers: {} };
}

/** Safe tool name for Anthropic/OpenAI: mcp__server__tool */
export function mcpToolName(serverId: string, toolName: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 28);
  return `mcp__${safe(serverId)}__${safe(toolName)}`.slice(0, 64);
}

export function parseMcpToolName(
  name: string,
): { serverId: string; toolName: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const idx = rest.indexOf("__");
  if (idx <= 0) return null;
  const serverId = rest.slice(0, idx);
  const toolName = rest.slice(idx + 2);
  if (!serverId || !toolName) return null;
  return { serverId, toolName };
}
