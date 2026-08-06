import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";
import {
  emptyMcpConfig,
  parseMcpServersConfig,
  type McpServersConfig,
} from "@/lib/mcp/types";

const FILE = "mcp-servers.json";

export async function readUserMcpConfig(userId: string): Promise<McpServersConfig> {
  if (!isSafeUserId(userId)) return emptyMcpConfig();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return emptyMcpConfig();
  try {
    return parseMcpServersConfig(JSON.parse(raw));
  } catch {
    return emptyMcpConfig();
  }
}

export async function writeUserMcpConfig(
  userId: string,
  config: McpServersConfig,
): Promise<McpServersConfig> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const normalized = parseMcpServersConfig(config);
  await writeUserFile(userId, FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

/** Prefer signed-in store; fall back to request-body / local config. */
export async function resolveMcpConfig(opts: {
  userId: string | null | undefined;
  clientConfig?: unknown;
}): Promise<McpServersConfig> {
  if (opts.userId) {
    const stored = await readUserMcpConfig(opts.userId);
    if (Object.keys(stored.mcpServers).length > 0) return stored;
  }
  if (opts.clientConfig !== undefined) {
    try {
      return parseMcpServersConfig(opts.clientConfig);
    } catch {
      return emptyMcpConfig();
    }
  }
  return emptyMcpConfig();
}
