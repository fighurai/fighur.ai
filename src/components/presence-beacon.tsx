"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { readCachedBrowserLocation } from "@/lib/browser-geolocation";

function sendPresencePing(path: string) {
  const location = readCachedBrowserLocation();
  void fetch("/api/presence/ping", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      location,
      referrer: typeof document !== "undefined" ? document.referrer : "",
      search: typeof window !== "undefined" ? window.location.search : "",
    }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}

/** Quiet heartbeat so the admin People page can see who is on the site. */
export function PresenceBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api")) return;
    sendPresencePing(search ? `${pathname}${search}` : pathname);
    const tick = () => {
      if (document.visibilityState === "visible") {
        sendPresencePing(search ? `${pathname}${search}` : pathname);
      }
    };
    const id = window.setInterval(tick, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pathname, search]);

  return null;
}
