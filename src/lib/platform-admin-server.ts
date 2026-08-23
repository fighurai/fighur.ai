import { cookies } from "next/headers";

import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { COOKIE_SESSION, readVerifiedSession, type SmileServerSession } from "@/lib/session-cookie";

export async function requirePlatformAdmin(
  session: SmileServerSession | null,
): Promise<{ ok: true; session: SmileServerSession } | { ok: false; status: 401 | 403; message: string }> {
  if (!session) {
    return { ok: false, status: 401, message: "Sign in required." };
  }
  if (!isPlatformAdminEmail(session.email)) {
    return { ok: false, status: 403, message: "Not found." };
  }
  return { ok: true, session };
}

/** Server Components / Route Handlers: read the sealed session from Next cookies. */
export async function readVerifiedSessionFromCookies(): Promise<SmileServerSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_SESSION)?.value;
  if (!raw) return null;
  const headers = new Headers();
  headers.set("cookie", `${COOKIE_SESSION}=${raw}`);
  return readVerifiedSession(new Request("https://fighur.ai/admin", { headers }));
}
