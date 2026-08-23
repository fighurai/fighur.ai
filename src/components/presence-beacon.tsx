"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { readCachedBrowserLocation } from "@/lib/browser-geolocation";

function sendPresencePing(path: string) {
  const location = readCachedBrowserLocation();
  void fetch("/api/presence/ping", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, location }),
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}

/** Quiet heartbeat so the admin People page can see who is on the site. */
export function PresenceBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api")) return;
    sendPresencePing(pathname);
    const tick = () => {
      if (document.visibilityState === "visible") sendPresencePing(pathname);
    };
    const id = window.setInterval(tick, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pathname]);

  return null;
}
