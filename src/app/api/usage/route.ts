import { NextResponse } from "next/server";

import { getUsageSummaryForClient } from "@/lib/auth-guard";
import {
  anonymousCookieOptions,
  createAnonymousId,
  readAnonymousId,
  sealAnonymousId,
} from "@/lib/anonymous-session";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }

  const session = await readVerifiedSession(request);
  let anonId = readAnonymousId(request);
  let setCookie = false;

  if (!session && !anonId) {
    anonId = createAnonymousId();
    setCookie = true;
  }

  const summary = await getUsageSummaryForClient(session, anonId);
  const res = NextResponse.json(summary);

  if (setCookie && anonId) {
    const sealed = sealAnonymousId(anonId);
    if (sealed) res.cookies.set("smile_anon", sealed, anonymousCookieOptions());
  }

  return res;
}
