import { NextResponse } from "next/server";

import {
  anonymousCookieOptions,
  createAnonymousId,
  readAnonymousId,
  readGuestId,
  sealAnonymousId,
} from "@/lib/anonymous-session";
import { clientHintFromUnknown, recordPresence } from "@/lib/record-presence";
import { readVerifiedSession } from "@/lib/session-cookie";

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  let anonId = session ? undefined : readGuestId(request) ?? readAnonymousId(request);
  let anonCookieToSet: string | null = null;
  if (!session && !anonId) {
    anonId = createAnonymousId();
    anonCookieToSet = sealAnonymousId(anonId);
  }

  let body: { path?: unknown; location?: unknown; referrer?: unknown; search?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const path = typeof body.path === "string" ? body.path : undefined;
  const referrer = typeof body.referrer === "string" ? body.referrer : undefined;
  const search = typeof body.search === "string" ? body.search : undefined;
  await recordPresence(request, {
    action: "page.view",
    userId: session?.userId,
    email: session?.email,
    name: session?.name,
    plan: session?.plan,
    anonId: session ? undefined : anonId ?? undefined,
    path,
    referrer,
    search,
    clientHint: clientHintFromUnknown(body.location),
  });

  const res = NextResponse.json({ ok: true });
  if (anonCookieToSet) {
    res.cookies.set("smile_anon", anonCookieToSet, anonymousCookieOptions());
  }
  return res;
}
