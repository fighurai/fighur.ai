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
  /** User wants “Cowork”-style help: organize files on device, drafts, etc. */
  coworkDevice: boolean;
  services: Record<ServiceId, { connected: boolean; label?: string }>;
};

const STORAGE_KEY = "smile-ai-connected-services-v1";

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

export function readConnectedServices(): ConnectedServicesState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ConnectedServicesState>;
    const base = defaultState();
    if (typeof parsed.coworkDevice === "boolean") base.coworkDevice = parsed.coworkDevice;
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

export function writeConnectedServices(next: ConnectedServicesState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("smile-connected-services-changed"));
  } catch {
    /* quota */
  }
}

/** Plain object for /api/chat — booleans only. */
export function toConnectedServicesPayload(state: ConnectedServicesState): Record<string, boolean> {
  const out: Record<string, boolean> = { coworkDevice: state.coworkDevice };
  for (const id of SERVICE_IDS) {
    out[id] = state.services[id].connected;
  }
  return out;
}
