import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/platform-admin-server";
import {
  readPresenceState,
  summarizePresence,
  visitorKeyFor,
  type PresenceVisitor,
} from "@/lib/presence-store";
import { readVerifiedSession } from "@/lib/session-cookie";
import { resolvePlatformArea } from "@/lib/platform-area";
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
  return Object.values(byKey)
    .map((row) => {
      if (row.lastArea) return row;
      const area = resolvePlatformArea({ path: row.lastPath || row.landingPath, action: row.lastAction });
      return {
        ...row,
        lastArea: area,
        areasUsed: row.areasUsed && Object.keys(row.areasUsed).length > 0 ? row.areasUsed : { [area]: 1 },
      };
    })
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  const access = await requirePlatformAdmin(session);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status, headers: NO_STORE });
  }

  const [state, profiles] = await Promise.all([readPresenceState(), listKnownProfiles()]);
  const people = mergeKnownAccounts(state.visitors, profiles);
  const merged: Record<string, PresenceVisitor> = Object.fromEntries(people.map((p) => [p.key, p]));

  return NextResponse.json(
    {
      ok: true,
      stats: summarizePresence({ v: 1, visitors: merged, events: state.events }),
      people,
      events: state.events.slice(0, 80),
    },
    { headers: NO_STORE },
  );
}
