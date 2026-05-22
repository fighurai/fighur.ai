import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { COOKIE_ANON } from "@/lib/anonymous-session";
import { COOKIE_GOOGLE, COOKIE_MICROSOFT, COOKIE_SLACK } from "@/lib/oauth-connection-cookies";
import { clientIp, userAgent } from "@/lib/request-context";
import { readVerifiedSession, COOKIE_SESSION } from "@/lib/session-cookie";

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  const ip = clientIp(request);
  const ua = userAgent(request);

  if (session) {
    await appendAudit({
      action: "auth.sign_out",
      outcome: "success",
      userId: session.userId,
      ip,
      userAgent: ua,
    });
  }

  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  const clear = (name: string) => {
    res.cookies.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  };
  clear(COOKIE_SESSION);
  clear(COOKIE_GOOGLE);
  clear(COOKIE_MICROSOFT);
  clear(COOKIE_SLACK);
  clear("smile_oauth_google_pending");
  clear("smile_oauth_microsoft_pending");
  clear("smile_oauth_slack_pending");
  clear(COOKIE_ANON);
  return res;
}
