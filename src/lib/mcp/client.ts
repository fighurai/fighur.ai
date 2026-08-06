import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  isHttpMcpServer,
  type McpHttpServerConfig,
  type McpServerConfig,
} from "@/lib/mcp/types";

export type McpListedTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

function requestInitFrom(cfg: McpHttpServerConfig): RequestInit | undefined {
  if (!cfg.headers || !Object.keys(cfg.headers).length) return undefined;
  return { headers: cfg.headers };
}

async function connectHttpClient(cfg: McpHttpServerConfig): Promise<Client> {
  const url = new URL(cfg.url);
  const requestInit = requestInitFrom(cfg);

  try {
    const client = new Client({ name: "fighur-ai", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
    return client;
  } catch {
    const client = new Client({ name: "fighur-ai", version: "1.0.0" });
    await client.connect(new SSEClientTransport(url, { requestInit }));
    return client;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeInputSchema(raw: unknown): McpListedTool["inputSchema"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { type: "object", properties: {} };
  }
  const s = raw as Record<string, unknown>;
  const properties =
    s.properties && typeof s.properties === "object" && !Array.isArray(s.properties)
      ? (s.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(s.required)
    ? s.required.filter((x): x is string => typeof x === "string")
    : undefined;
  return { type: "object", properties, required };
}

export async function listMcpServerTools(
  cfg: McpHttpServerConfig,
  opts?: { timeoutMs?: number },
): Promise<McpListedTool[]> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const client = await withTimeout(connectHttpClient(cfg), timeoutMs, "MCP connect");
  try {
    const listed = await withTimeout(client.listTools(), timeoutMs, "MCP listTools");
    return (listed.tools ?? []).slice(0, 40).map((t) => ({
      name: t.name,
      description: typeof t.description === "string" ? t.description : undefined,
      inputSchema: normalizeInputSchema(t.inputSchema),
    }));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const c = item as { type?: string; text?: string; data?: unknown; mimeType?: string };
    if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
    else {
      try {
        parts.push(JSON.stringify(item));
      } catch {
        /* skip */
      }
    }
  }
  return parts.join("\n") || JSON.stringify(content);
}

export async function callMcpServerTool(
  cfg: McpHttpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const timeoutMs = opts?.timeoutMs ?? 25_000;
  try {
    const client = await withTimeout(connectHttpClient(cfg), Math.min(timeoutMs, 12_000), "MCP connect");
    try {
      const result = await withTimeout(
        client.callTool({ name: toolName, arguments: args }),
        timeoutMs,
        `MCP callTool(${toolName})`,
      );
      const isError = Boolean((result as { isError?: boolean }).isError);
      const text = contentToString((result as { content?: unknown }).content);
      if (isError) return { ok: false, error: text || "MCP tool returned an error" };
      return { ok: true, content: text || "(empty result)" };
    } finally {
      await client.close().catch(() => undefined);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "MCP call failed" };
  }
}

export type McpProbeResult = {
  serverId: string;
  transport: "http" | "stdio" | "unsupported";
  ok: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
};

export async function probeMcpServer(
  serverId: string,
  cfg: McpServerConfig,
): Promise<McpProbeResult> {
  if (!isHttpMcpServer(cfg)) {
    return {
      serverId,
      transport: "stdio",
      ok: false,
      error:
        "Stdio MCP servers need a local/desktop host. On fighur.ai use a remote url (Streamable HTTP or SSE).",
    };
  }
  try {
    const tools = await listMcpServerTools(cfg, { timeoutMs: 12_000 });
    return {
      serverId,
      transport: "http",
      ok: true,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    };
  } catch (e) {
    return {
      serverId,
      transport: "http",
      ok: false,
      error: e instanceof Error ? e.message : "Probe failed",
    };
  }
}
