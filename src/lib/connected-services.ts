import { conversationStorageUserId } from "@/lib/conversation-storage";
import { normalizeWorkMode, type WorkMode } from "@/lib/work-mode";

export const SERVICE_IDS = [
  "gmail",
  "outlook",
  "googleCalendar",
  "microsoft365",
  "slack",
  "deviceFiles",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export type ConnectedServicesState = {
  /** How the assistant should behave (Chat · CoWork · Codex). */
  workMode: WorkMode;
  /** @deprecated Use workMode === "cowork". Kept for migration. */
  coworkDevice: boolean;
  services: Record<ServiceId, { connected: boolean; label?: string }>;
};

function storageKeyForUser(userId?: string | null): string {
  return `smile-ai-connected-services-v1:${conversationStorageUserId(userId)}`;
}

export const SERVICE_LABELS: Record<ServiceId, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Microsoft mail",
  googleCalendar: "Google Calendar",
  microsoft365: "Microsoft 365",
  slack: "Slack",
  deviceFiles: "This device (files & folders)",
};

function defaultState(): ConnectedServicesState {
  return {
    workMode: "chat",
    coworkDevice: false,
    services: {
      gmail: { connected: false },
      outlook: { connected: false },
      googleCalendar: { connected: false },
      microsoft365: { connected: false },
      slack: { connected: false },
      deviceFiles: { connected: false },
    },
  };
}

export function readConnectedServices(userId?: string | null): ConnectedServicesState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ConnectedServicesState>;
    const base = defaultState();
    const legacyCowork = typeof parsed.coworkDevice === "boolean" ? parsed.coworkDevice : false;
    base.workMode = normalizeWorkMode(
      (parsed as { workMode?: unknown }).workMode,
      legacyCowork,
    );
    base.coworkDevice = base.workMode === "cowork";
    for (const id of SERVICE_IDS) {
      const s = parsed.services?.[id];
      if (s && typeof s === "object" && typeof s.connected === "boolean") {
        base.services[id] = {
          connected: s.connected,
          label: typeof s.label === "string" ? s.label : undefined,
        };
      }
    }
    return base;
  } catch {
    return defaultState();
  }
}

export function writeConnectedServices(
  next: ConnectedServicesState,
  userId?: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify(next));
    window.dispatchEvent(new Event("smile-connected-services-changed"));
  } catch {
    /* quota */
  }
}

/** Payload for /api/chat (booleans + work mode string). */
export function toConnectedServicesPayload(
  state: ConnectedServicesState,
): Record<string, boolean | string | undefined> {
  const out: Record<string, boolean | string> = {
    workMode: state.workMode,
    coworkDevice: state.workMode === "cowork",
  };
  for (const id of SERVICE_IDS) {
    out[id] = state.services[id].connected;
  }
  return out;
}
