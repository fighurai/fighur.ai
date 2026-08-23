import { NextResponse } from "next/server";

import {
  anonymousCookieOptions,
  createAnonymousId,
  readAnonymousId,
  sealAnonymousId,
} from "@/lib/anonymous-session";
import { clientHintFromUnknown, recordPresence } from "@/lib/record-presence";
import { readVerifiedSession } from "@/lib/session-cookie";

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  let anonId = readAnonymousId(request);
  let anonCookieToSet: string | null = null;
  if (!session && !anonId) {
    anonId = createAnonymousId();
    anonCookieToSet = sealAnonymousId(anonId);
  }

  let body: { path?: unknown; location?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const path = typeof body.path === "string" ? body.path : undefined;
  await recordPresence(request, {
    action: "page.view",
    userId: session?.userId,
    email: session?.email,
    name: session?.name,
    plan: session?.plan,
    anonId: session ? undefined : anonId ?? undefined,
    path,
    clientHint: clientHintFromUnknown(body.location),
  });

  const res = NextResponse.json({ ok: true });
  if (anonCookieToSet) {
    res.cookies.set("smile_anon", anonCookieToSet, anonymousCookieOptions());
  }
  return res;
}
