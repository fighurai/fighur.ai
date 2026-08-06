import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import { normalizeLayoutPrefs } from "@/lib/layout-storage";
import { normalizeWorkMode } from "@/lib/work-mode";
import { readUserPreferences, writeUserPreferences } from "@/lib/user-preferences-store";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const prefs = await readUserPreferences(session.userId);
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { workMode?: unknown; customInstructions?: unknown; layout?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof writeUserPreferences>[1] = {};
  if (body.workMode !== undefined) patch.workMode = normalizeWorkMode(body.workMode);
  if (typeof body.customInstructions === "string") {
    patch.customInstructions = body.customInstructions;
  }
  if (body.layout !== undefined && body.layout !== null && typeof body.layout === "object") {
    patch.layout = normalizeLayoutPrefs(body.layout as Parameters<typeof normalizeLayoutPrefs>[0]);
  }

  const prefs = await writeUserPreferences(session.userId, patch);
  return NextResponse.json({ preferences: prefs });
}
