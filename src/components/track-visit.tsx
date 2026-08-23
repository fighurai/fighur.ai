import { after } from "next/server";
import { cookies, headers } from "next/headers";

import { COOKIE_SESSION, COOKIE_TOUCH, isGuestId } from "@/lib/presence-cookies";
import { recordPresence } from "@/lib/record-presence";
import { readVerifiedSession } from "@/lib/session-cookie";

function isPrefetch(h: Headers): boolean {
  return (
    h.get("next-router-prefetch") === "1" ||
    h.get("x-middleware-prefetch") === "1" ||
    h.get("purpose") === "prefetch"
  );
}

/** Records the real page request (Vercel city / region / country) after the response is sent. */
export async function TrackVisit() {
  const h = await headers();
  if (isPrefetch(h)) return null;

  const path = h.get("x-fighur-path") || "/";
  if (path.startsWith("/api") || path.startsWith("/_next")) return null;

  const headerList = new Headers(h);
  const request = new Request("https://fighur.ai/presence-track", { headers: headerList });

  after(async () => {
    try {
      const session = await readVerifiedSession(request);
      const jar = await cookies();
      const touch = jar.get(COOKIE_TOUCH)?.value;
      const signedIn = Boolean(jar.get(COOKIE_SESSION)?.value && session?.userId);
      const guestId = signedIn ? undefined : touch && isGuestId(touch) ? touch : undefined;

      await recordPresence(request, {
        action: "page.view",
        userId: session?.userId,
        email: session?.email,
        name: session?.name,
        plan: session?.plan,
        anonId: guestId,
        path,
        search: h.get("x-fighur-search") || "",
        referrer: h.get("x-fighur-referrer") || h.get("referer") || "",
      });
    } catch {
      /* tracking must not break the page */
    }
  });

  return null;
}
