import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import { COOKIE_ANON, COOKIE_TOUCH, isGuestId } from "@/lib/presence-cookies";
import { COOKIE_SESSION } from "@/lib/session-cookie";

function hasCookie(request: NextRequest, name: string): boolean {
  return Boolean(request.cookies.get(name)?.value);
}

function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("x-middleware-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  );
}

function isTrackablePage(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/a/")) return false;
  return true;
}

function newTouchId(): string {
  return `t_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!request.nextUrl.pathname.startsWith("/a/")) {
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=(self)");
  }
  if (request.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  const pathname = request.nextUrl.pathname;
  if (!isTrackablePage(pathname) || isPrefetch(request)) {
    return res;
  }

  let touchId = request.cookies.get(COOKIE_TOUCH)?.value;
  if (!hasCookie(request, COOKIE_SESSION) && !hasCookie(request, COOKIE_ANON)) {
    if (!touchId || !isGuestId(touchId)) {
      touchId = newTouchId();
    }
    const secure = request.nextUrl.protocol === "https:";
    res.cookies.set(COOKIE_TOUCH, touchId, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const cookieParts = [request.headers.get("cookie")];
  if (touchId) cookieParts.push(`${COOKIE_TOUCH}=${touchId}`);
  const hitUrl = new URL("/api/presence/hit", request.nextUrl.origin);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    cookie: cookieParts.filter(Boolean).join("; "),
  };
  for (const name of [
    "x-forwarded-for",
    "x-real-ip",
    "user-agent",
    "x-vercel-ip-city",
    "x-vercel-ip-country",
    "x-vercel-ip-country-region",
    "x-vercel-ip-latitude",
    "x-vercel-ip-longitude",
    "x-vercel-ip-timezone",
  ]) {
    const v = request.headers.get(name);
    if (v) headers[name] = v;
  }

  event.waitUntil(
    fetch(hitUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        path: pathname,
        search: request.nextUrl.search,
        referrer: request.headers.get("referer") ?? "",
      }),
    }).catch(() => {
      /* tracking must not break the page */
    }),
  );

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
