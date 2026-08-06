import { NextResponse } from "next/server";

import {
  createManagedAgent,
  deleteManagedAgent,
  getAgentStore,
  setActiveManagedAgent,
  updateManagedAgent,
  type AgentEffort,
} from "@/lib/agents/store";
import { readVerifiedSession } from "@/lib/session-cookie";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const store = await getAgentStore(session.userId);
  return NextResponse.json({
    agents: store.agents,
    activeAgentId: store.activeAgentId,
    ephemeralStorage: usesEphemeralUserStorage(),
  });
}

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    action?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    behaviorInstructions?: unknown;
    responseInstructions?: unknown;
    deepResearch?: unknown;
    effort?: unknown;
    skillAllowlist?: unknown;
    enabled?: unknown;
    activeAgentId?: unknown;
  };

  const action = typeof b.action === "string" ? b.action : "create";

  try {
    if (action === "create") {
      const agent = await createManagedAgent(session.userId, {
        name: typeof b.name === "string" ? b.name : "",
        description: typeof b.description === "string" ? b.description : "",
        behaviorInstructions:
          typeof b.behaviorInstructions === "string" ? b.behaviorInstructions : "",
        responseInstructions:
          typeof b.responseInstructions === "string" ? b.responseInstructions : "",
        deepResearch: Boolean(b.deepResearch),
        effort: b.effort as AgentEffort | undefined,
        skillAllowlist: Array.isArray(b.skillAllowlist)
          ? b.skillAllowlist.filter((s): s is string => typeof s === "string")
          : undefined,
        enabled: b.enabled !== false,
      });
      return NextResponse.json({ ok: true, agent });
    }

    if (action === "update") {
      const id = typeof b.id === "string" ? b.id : "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Parameters<typeof updateManagedAgent>[2] = {};
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.description === "string") patch.description = b.description;
      if (typeof b.behaviorInstructions === "string") {
        patch.behaviorInstructions = b.behaviorInstructions;
      }
      if (typeof b.responseInstructions === "string") {
        patch.responseInstructions = b.responseInstructions;
      }
      if (typeof b.deepResearch === "boolean") patch.deepResearch = b.deepResearch;
      if (b.effort === "auto" || b.effort === "low" || b.effort === "high") {
        patch.effort = b.effort;
      }
      if (Array.isArray(b.skillAllowlist)) {
        patch.skillAllowlist = b.skillAllowlist.filter((s): s is string => typeof s === "string");
      }
      if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
      const agent = await updateManagedAgent(session.userId, id, patch);
      if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, agent });
    }

    if (action === "delete") {
      const id = typeof b.id === "string" ? b.id : "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ok = await deleteManagedAgent(session.userId, id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (action === "setActive") {
      const activeAgentId =
        b.activeAgentId === null
          ? null
          : typeof b.activeAgentId === "string"
            ? b.activeAgentId
            : typeof b.id === "string"
              ? b.id
              : null;
      const store = await setActiveManagedAgent(session.userId, activeAgentId);
      return NextResponse.json({
        ok: true,
        activeAgentId: store.activeAgentId,
        agents: store.agents,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent request failed" },
      { status: 400 },
    );
  }
}
