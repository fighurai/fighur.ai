import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
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

  let body: { workMode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prefs = await writeUserPreferences(session.userId, {
    workMode: normalizeWorkMode(body.workMode),
  });
  return NextResponse.json({ preferences: prefs });
}
