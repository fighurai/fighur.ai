import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveUserPlan, resolveUserRoles } from "@/lib/auth-guard";
import { hasPageThemeExtensionAccess } from "@/lib/plan-access";
import { extensionCorsHeaders } from "@/lib/extension-cors";
import { readVerifiedSession } from "@/lib/session-cookie";
import { ensureComplimentaryEntitlements, readUserProfile } from "@/lib/user-data-store";

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: extensionCorsHeaders(request),
  });
}

export async function GET(request: NextRequest) {
  const cors = extensionCorsHeaders(request);
  const session = await readVerifiedSession(request);
  if (!session?.userId) {
    return NextResponse.json(
      { ok: true, signedIn: false, pro: false, features: { pageTheme: false } },
      { status: 401, headers: cors },
    );
  }

  await ensureComplimentaryEntitlements(session.userId, session.email);
  const plan = await resolveUserPlan(session.userId, session);
  const roles = await resolveUserRoles(session.userId, session);
  const profile = await readUserProfile(session.userId);
  const pageTheme = hasPageThemeExtensionAccess(plan, roles);

  return NextResponse.json(
    {
      ok: true,
      signedIn: true,
      email: profile?.email ?? session.email,
      plan,
      pro: plan === "pro" || pageTheme,
      features: {
        pageTheme,
      },
    },
    { headers: cors },
  );
}
