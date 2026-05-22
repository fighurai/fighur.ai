import { NextResponse } from "next/server";

import type { SavedConversation } from "@/lib/conversation-storage";
import { readVerifiedSession } from "@/lib/session-cookie";
import {
  readUserConversations,
  writeUserConversations,
} from "@/lib/user-conversations-store";

function parseList(raw: unknown): SavedConversation[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SavedConversation[] = [];
  for (const c of raw) {
    if (
      c &&
      typeof c === "object" &&
      typeof (c as { id?: unknown }).id === "string" &&
      Array.isArray((c as { messages?: unknown }).messages) &&
      typeof (c as { updatedAt?: unknown }).updatedAt === "number"
    ) {
      out.push(c as SavedConversation);
    }
  }
  return out;
}

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const conversations = await readUserConversations(session.userId);
  return NextResponse.json({ conversations });
}

export async function PUT(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { conversations?: unknown };
  try {
    body = (await request.json()) as { conversations?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const list = parseList(body.conversations);
  if (!list) {
    return NextResponse.json({ error: "conversations[] required" }, { status: 400 });
  }

  try {
    await writeUserConversations(session.userId, list);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
