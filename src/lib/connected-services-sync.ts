"use client";

import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";
import { normalizeWorkMode } from "@/lib/work-mode";

async function fetchConnectStatus(): Promise<ConnectStatusResponse | null> {
  try {
    const res = await fetch("/api/connect/status", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ConnectStatusResponse;
  } catch {
    return null;
  }
}

async function fetchServerPreferences(): Promise<{ workMode?: string } | null> {
  try {
    const res = await fetch("/api/user/preferences", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: { workMode?: string } };
    return data.preferences ?? null;
  } catch {
    return null;
  }
}

/** Restore OAuth connection flags and work mode from the server after sign-in. */
export async function syncConnectedServicesFromServer(userId: string): Promise<ConnectedServicesState> {
  const local = readConnectedServices(userId);
  const [oauth, prefs] = await Promise.all([fetchConnectStatus(), fetchServerPreferences()]);

  const next: ConnectedServicesState = {
    ...local,
    workMode: prefs?.workMode
      ? normalizeWorkMode(prefs.workMode, local.workMode === "cowork")
      : local.workMode,
    coworkDevice:
      (prefs?.workMode
        ? normalizeWorkMode(prefs.workMode, local.workMode === "cowork")
        : local.workMode) === "cowork",
    services: { ...local.services },
  };

  if (oauth?.google.connected) {
    next.services.gmail = { connected: true, label: oauth.google.email ?? "Gmail" };
    next.services.googleCalendar = { connected: true, label: oauth.google.email ?? "Calendar" };
  } else {
    next.services.gmail = { connected: false };
    next.services.googleCalendar = { connected: false };
  }

  if (oauth?.microsoft.connected) {
    const label = oauth.microsoft.email ?? "Microsoft";
    next.services.outlook = { connected: true, label };
    next.services.microsoft365 = { connected: true, label };
  } else {
    next.services.outlook = { connected: false };
    next.services.microsoft365 = { connected: false };
  }

  next.coworkDevice = next.workMode === "cowork";
  writeConnectedServices(next, userId);
  return next;
}

export async function saveWorkModeToServer(workMode: string): Promise<void> {
  try {
    await fetch("/api/user/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workMode }),
    });
  } catch {
    /* ignore */
  }
}
