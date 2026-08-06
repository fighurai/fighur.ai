import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { COOKIE_ANON } from "@/lib/anonymous-session";
import { COOKIE_GOOGLE, COOKIE_MICROSOFT, COOKIE_SLACK } from "@/lib/oauth-connection-cookies";
import { clientIp, userAgent } from "@/lib/request-context";
import { COOKIE_SESSION, readVerifiedSession } from "@/lib/session-cookie";
import { deleteUserAccount } from "@/lib/user-data-store";

/**
 * DELETE /api/auth/account — permanently delete the signed-in user's account.
 * Required for App Store Guideline 5.1.1(v).
 */
export async function DELETE(request: Request) {
  const session = await readVerifiedSession(request);
  const ip = clientIp(request);
  const ua = userAgent(request);

  if (!session?.userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await appendAudit({
      action: "auth.account_delete",
      outcome: "success",
      userId: session.userId,
      ip,
      userAgent: ua,
    });
    await deleteUserAccount(session.userId);
  } catch (err) {
    await appendAudit({
      action: "auth.account_delete",
      outcome: "failure",
      userId: session.userId,
      ip,
      userAgent: ua,
      meta: { error: err instanceof Error ? err.message : "unknown" },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete account." },
      { status: 500 },
    );
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
