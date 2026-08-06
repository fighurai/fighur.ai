import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import { probeMcpServer } from "@/lib/mcp/client";
import {
  readUserMcpConfig,
  writeUserMcpConfig,
} from "@/lib/mcp/config-store";
import {
  emptyMcpConfig,
  isHttpMcpServer,
  isStdioMcpServer,
  parseMcpServersConfig,
} from "@/lib/mcp/types";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (!session) {
    return NextResponse.json({ signedIn: false, config: emptyMcpConfig() });
  }

  const config = await readUserMcpConfig(session.userId);

  if (action === "probe") {
    const results = await Promise.all(
      Object.entries(config.mcpServers).map(([id, cfg]) => probeMcpServer(id, cfg)),
    );
    return NextResponse.json({ signedIn: true, config, probes: results });
  }

  const summary = Object.entries(config.mcpServers).map(([id, cfg]) => ({
    id,
    transport: isHttpMcpServer(cfg) ? "http" : isStdioMcpServer(cfg) ? "stdio" : "unknown",
    url: isHttpMcpServer(cfg) ? cfg.url : undefined,
    command: isStdioMcpServer(cfg) ? cfg.command : undefined,
  }));

  return NextResponse.json({ signedIn: true, config, summary });
}

export async function PUT(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required to save MCP config" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const config = parseMcpServersConfig(body);
    const saved = await writeUserMcpConfig(session.userId, config);
    return NextResponse.json({ ok: true, config: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid MCP config" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { action?: unknown; config?: unknown };
  if (b.action !== "probe") {
    return NextResponse.json({ error: 'action must be "probe"' }, { status: 400 });
  }

  const session = await readVerifiedSession(request);

  let config;
  try {
    if (b.config !== undefined) {
      config = parseMcpServersConfig(b.config);
    } else if (session) {
      config = await readUserMcpConfig(session.userId);
    } else {
      return NextResponse.json(
        { error: "Provide config in the body, or sign in to probe saved servers" },
        { status: 400 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid MCP config" },
      { status: 400 },
    );
  }

  const probes = await Promise.all(
    Object.entries(config.mcpServers).map(([id, cfg]) => probeMcpServer(id, cfg)),
  );
  return NextResponse.json({ ok: true, probes });
}
