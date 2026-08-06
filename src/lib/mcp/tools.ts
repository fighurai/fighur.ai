import { listMcpServerTools, callMcpServerTool } from "@/lib/mcp/client";
import {
  isHttpMcpServer,
  mcpToolName,
  type McpServersConfig,
} from "@/lib/mcp/types";
import type { AgentToolDefinition, AgentToolResult } from "@/lib/agent-tools/types";

export type McpToolBinding = {
  serverId: string;
  toolName: string;
};

const MAX_TOOLS = 40;

/**
 * Discover HTTP MCP tools and map them to agent tool definitions.
 * Returns definitions plus a name → binding map for execute.
 */
export async function loadMcpAgentTools(
  config: McpServersConfig,
): Promise<{ tools: AgentToolDefinition[]; bindings: Record<string, McpToolBinding> }> {
  const tools: AgentToolDefinition[] = [];
  const bindings: Record<string, McpToolBinding> = {};
  const entries = Object.entries(config.mcpServers).filter(([, cfg]) => isHttpMcpServer(cfg));

  const settled = await Promise.allSettled(
    entries.map(async ([serverId, cfg]) => {
      if (!isHttpMcpServer(cfg)) return { serverId, listed: [] as Awaited<ReturnType<typeof listMcpServerTools>> };
      const listed = await listMcpServerTools(cfg, { timeoutMs: 10_000 });
      return { serverId, listed };
    }),
  );

  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const { serverId, listed } = s.value;
    for (const t of listed) {
      if (tools.length >= MAX_TOOLS) break;
      const name = mcpToolName(serverId, t.name);
      if (bindings[name]) continue;
      bindings[name] = { serverId, toolName: t.name };
      tools.push({
        name,
        description: `[MCP:${serverId}] ${t.description?.trim() || t.name}`,
        input_schema: t.inputSchema,
      });
    }
  }

  return { tools, bindings };
}

export async function executeMcpAgentTool(
  config: McpServersConfig,
  binding: McpToolBinding,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const cfg = config.mcpServers[binding.serverId];
  if (!cfg || !isHttpMcpServer(cfg)) {
    return {
      content: `MCP server "${binding.serverId}" is not an HTTP/SSE server or is missing.`,
      isError: true,
    };
  }
  const res = await callMcpServerTool(cfg, binding.toolName, input);
  if (!res.ok) return { content: res.error, isError: true };
  return { content: res.content };
}

/** Short system-prompt blurb when MCP tools are attached. */
export function formatMcpSystemContext(
  tools: AgentToolDefinition[],
  skippedStdio: string[],
): string {
  if (!tools.length && !skippedStdio.length) return "";
  const lines: string[] = [
    "",
    "## MCP tools (user-configured)",
    "Remote MCP servers are connected. Call tools whose names start with `mcp__` when relevant.",
  ];
  if (tools.length) {
    lines.push(
      `Available (${tools.length}): ${tools
        .slice(0, 24)
        .map((t) => t.name)
        .join(", ")}${tools.length > 24 ? "…" : ""}`,
    );
  }
  if (skippedStdio.length) {
    lines.push(
      `Stdio-only servers (not runnable on hosted FigHur): ${skippedStdio.join(", ")}. Use a remote \`url\` instead.`,
    );
  }
  return lines.join("\n");
}
