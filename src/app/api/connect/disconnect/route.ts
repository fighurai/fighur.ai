import { NextResponse } from "next/server";

import { COOKIE_GOOGLE, COOKIE_MICROSOFT, COOKIE_SLACK } from "@/lib/oauth-connection-cookies";
import { readVerifiedSession } from "@/lib/session-cookie";
import { deleteProviderConnection } from "@/lib/user-oauth-store";

export async function POST(request: Request) {
  let body: { provider?: string } = {};
  try {
    body = (await request.json()) as { provider?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider?.trim();
  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  if (provider !== "google" && provider !== "microsoft" && provider !== "slack") {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }

  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  await deleteProviderConnection(session.userId, provider);

  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  const clear = (name: string) => {
    res.cookies.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  };

  if (provider === "google") clear(COOKIE_GOOGLE);
  else if (provider === "microsoft") clear(COOKIE_MICROSOFT);
  else clear(COOKIE_SLACK);

  return res;
}
