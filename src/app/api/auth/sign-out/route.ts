import { NextResponse } from "next/server";

import { COOKIE_GOOGLE, COOKIE_MICROSOFT, COOKIE_SLACK } from "@/lib/oauth-connection-cookies";
import { COOKIE_SESSION } from "@/lib/session-cookie";

export async function POST() {
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
  return res;
}
