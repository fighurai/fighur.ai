import { NextResponse } from "next/server";

import {
  anonymousCookieOptions,
  createAnonymousId,
  isGuestId,
  readGuestId,
  sealAnonymousId,
} from "@/lib/anonymous-session";
import { recordPresence } from "@/lib/record-presence";
import { readVerifiedSession } from "@/lib/session-cookie";
import { parseTrafficSource } from "@/lib/traffic-source";

export const dynamic = "force-dynamic";

function isTrackablePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/_next")) return false;
  return true;
}

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  let anonId: string | undefined = session ? undefined : readGuestId(request) ?? undefined;
  let anonCookieToSet: string | null = null;
  if (!session && !anonId) {
    anonId = createAnonymousId();
    anonCookieToSet = sealAnonymousId(anonId);
  }

  let body: { path?: unknown; search?: unknown; referrer?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const path = typeof body.path === "string" ? body.path : "/";
  if (!isTrackablePath(path.split("?")[0] || path)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const search = typeof body.search === "string" ? body.search : "";
  const referrer =
    typeof body.referrer === "string"
      ? body.referrer
      : (request.headers.get("referer") ?? undefined);
  const traffic = parseTrafficSource({ referrer, search });

  await recordPresence(request, {
    action: "page.view",
    userId: session?.userId,
    email: session?.email,
    name: session?.name,
    plan: session?.plan,
    anonId,
    path,
    search,
    referrer,
    traffic,
    forceEvent: true,
  });

  const res = NextResponse.json({ ok: true });
  if (anonCookieToSet && anonId && isGuestId(anonId)) {
    res.cookies.set("smile_anon", anonCookieToSet, anonymousCookieOptions());
  }
  return res;
}
