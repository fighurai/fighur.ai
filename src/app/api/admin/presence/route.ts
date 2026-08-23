import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth-guard";
import {
  readPresenceState,
  summarizePresence,
  visitorKeyFor,
  type PresenceVisitor,
} from "@/lib/presence-store";
import { readVerifiedSession } from "@/lib/session-cookie";
import { listKnownProfiles } from "@/lib/user-data-store";

export const dynamic = "force-dynamic";

function mergeKnownAccounts(
  visitors: Record<string, PresenceVisitor>,
  profiles: Awaited<ReturnType<typeof listKnownProfiles>>,
): PresenceVisitor[] {
  const byKey = { ...visitors };
  for (const profile of profiles) {
    const key = visitorKeyFor({ userId: profile.userId });
    if (!key) continue;
    const existing = byKey[key];
    if (existing) {
      byKey[key] = {
        ...existing,
        hasAccount: true,
        userId: profile.userId,
        email: existing.email || profile.email,
        name: existing.name || profile.name,
        plan: existing.plan || profile.plan,
        authProvider: existing.authProvider || profile.authProvider,
      };
      continue;
    }
    byKey[key] = {
      key,
      hasAccount: true,
      userId: profile.userId,
      email: profile.email,
      name: profile.name,
      plan: profile.plan,
      authProvider: profile.authProvider,
      firstSeenAt: profile.createdAt,
      lastSeenAt: profile.updatedAt,
      lastAction: "auth.sign_in",
      visitCount: 0,
    };
  }
  return Object.values(byKey).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  const access = await requirePermission(session, "admin:users");
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: session ? 403 : 401 });
  }

  const [state, profiles] = await Promise.all([readPresenceState(), listKnownProfiles()]);
  const people = mergeKnownAccounts(state.visitors, profiles);
  const merged: Record<string, PresenceVisitor> = Object.fromEntries(people.map((p) => [p.key, p]));

  return NextResponse.json({
    ok: true,
    stats: summarizePresence({ v: 1, visitors: merged, events: state.events }),
    people,
    events: state.events.slice(0, 80),
  });
}
