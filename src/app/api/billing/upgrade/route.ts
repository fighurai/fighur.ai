import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { sessionJsonBody } from "@/lib/auth-session";
import { clientIp, userAgent } from "@/lib/request-context";
import { readVerifiedSession } from "@/lib/session-cookie";
import { readUserProfile, setUserPlan } from "@/lib/user-data-store";
import { normalizeRoles } from "@/lib/rbac";

/** Dev/test: set SMILE_ALLOW_DEV_PRO_UPGRADE=true to upgrade without Stripe. */
function devUpgradeEnabled(): boolean {
  return process.env.SMILE_ALLOW_DEV_PRO_UPGRADE === "true";
}

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  const ip = clientIp(request);
  const ua = userAgent(request);

  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const profile = await readUserProfile(session.userId);
  if (!profile) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (profile.plan === "pro") {
    return NextResponse.json({
      ok: true,
      plan: "pro",
      message: "You already have Pro access to every model.",
    });
  }

  if (!devUpgradeEnabled()) {
    return NextResponse.json(
      {
        error: "Stripe checkout for Pro is not configured yet. Contact support to upgrade.",
        code: "BILLING_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  const ok = await setUserPlan(session.userId, "pro");
  if (!ok) {
    return NextResponse.json({ error: "Could not update plan." }, { status: 500 });
  }

  await appendAudit({
    action: "billing.upgrade",
    outcome: "success",
    userId: session.userId,
    ip,
    userAgent: ua,
    meta: { method: "dev" },
  });

  return NextResponse.json(
    sessionJsonBody({
      userId: profile.userId,
      email: profile.email,
      name: profile.name,
      roles: normalizeRoles(profile.roles),
      environmentId: profile.environmentId,
      plan: "pro",
    }),
  );
}
