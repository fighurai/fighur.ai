"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PrivacyWaiverModal } from "@/components/privacy-waiver-modal";
import { readSession } from "@/lib/auth-storage";
import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";
import { syncConnectedServicesFromServer } from "@/lib/connected-services-sync";
import {
  CONNECTOR_CATEGORIES,
  CONNECTORS_CATALOG,
  type ConnectorConnectAction,
  type ConnectorCatalogEntry,
} from "@/lib/connectors-catalog";
import {
  connectDeviceFolder,
  idbClearDeviceHandle,
  supportsDeviceFolderPicker,
} from "@/lib/device-files-client";
import {
  hasAcceptedPrivacyWaiver,
  recordPrivacyWaiverAcceptance,
  type PrivacyWaiverKind,
} from "@/lib/privacy-waiver";

const OAUTH_ERROR_HINTS: Record<string, string> = {
  storage_failed: "Could not save the connection. Try again after signing in.",
  invalid_callback: "OAuth state expired. Open Settings and click Connect again.",
  bad_state: "OAuth state mismatch. Click Connect again.",
  missing_google_env: "Google OAuth is not configured on the server.",
  missing_microsoft_env: "Microsoft OAuth is not configured on the server.",
  missing_slack_env: "Slack OAuth is not configured on the server.",
  access_denied: "You cancelled or the provider denied access.",
};

async function fetchConnectStatus(): Promise<ConnectStatusResponse> {
  const res = await fetch("/api/connect/status", { cache: "no-store" });
  return (await res.json()) as ConnectStatusResponse;
}

function emptyStatus(): ConnectStatusResponse {
  return {
    configured: false,
    google: { connected: false },
    microsoft: { connected: false },
    slack: { connected: false },
  };
}

export function SettingsConnectorsPanel() {
  const [oauth, setOauth] = useState<ConnectStatusResponse | null>(null);
  const [local, setLocal] = useState<ConnectedServicesState>(() =>
    readConnectedServices(readSession()?.userId),
  );
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverTitle, setWaiverTitle] = useState("Connect integration");
  const pendingConnectRef = useRef<(() => void) | null>(null);

  const refreshOauth = useCallback(async () => {
    try {
      setOauth(await fetchConnectStatus());
    } catch {
      setOauth(emptyStatus());
    }
  }, []);

  const refreshLocal = useCallback(
    () => setLocal(readConnectedServices(readSession()?.userId)),
    [],
  );

  const persistLocal = useCallback((next: ConnectedServicesState) => {
    setLocal(next);
    writeConnectedServices(next, readSession()?.userId);
  }, []);

  useEffect(() => {
    void refreshOauth();
    refreshLocal();
    const userId = readSession()?.userId;
    if (userId) void syncConnectedServicesFromServer(userId).then(() => refreshLocal());

    const on = () => refreshLocal();
    window.addEventListener("smile-connected-services-changed", on);
    window.addEventListener("smile-auth-changed", on);
    return () => {
      window.removeEventListener("smile-connected-services-changed", on);
      window.removeEventListener("smile-auth-changed", on);
    };
  }, [refreshOauth, refreshLocal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const connected = u.searchParams.get("connected");
    const oauthErr = u.searchParams.get("oauth_error");
    if (connected || oauthErr) {
      void refreshOauth();
      const userId = readSession()?.userId;
      if (userId) void syncConnectedServicesFromServer(userId).then(() => refreshLocal());
      if (oauthErr) {
        setOauthError(OAUTH_ERROR_HINTS[oauthErr] ?? `Connection error: ${oauthErr}`);
      }
      u.searchParams.delete("connected");
      u.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", `${u.pathname}${u.search}`);
    }
  }, [refreshOauth, refreshLocal]);

  const requirePrivacyWaiver = (
    kind: PrivacyWaiverKind,
    title: string,
    action: () => void,
  ) => {
    setConnectError(null);
    setOauthError(null);
    setDeviceError(null);
    const userId = readSession()?.userId;
    if (!userId && kind !== "device") {
      setConnectError("Sign in first — connections are saved to your account on this server.");
      return;
    }
    if (!userId && kind === "device") {
      setDeviceError("Sign in to link a folder to your account.");
      return;
    }
    if (userId && hasAcceptedPrivacyWaiver(userId)) {
      action();
      return;
    }
    pendingConnectRef.current = action;
    setWaiverTitle(title);
    setWaiverOpen(true);
  };

  const disconnectProvider = async (provider: "google" | "microsoft" | "slack") => {
    setOauthBusy(provider);
    try {
      await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      await refreshOauth();
      const next = readConnectedServices(readSession()?.userId);
      if (provider === "google") {
        next.services.gmail = { connected: false };
        next.services.googleCalendar = { connected: false };
      } else if (provider === "microsoft") {
        next.services.outlook = { connected: false };
        next.services.microsoft365 = { connected: false };
      } else {
        next.services.slack = { connected: false };
      }
      persistLocal(next);
    } finally {
      setOauthBusy(null);
    }
  };

  const startConnect = (action: ConnectorConnectAction) => {
    if (action === "google") {
      requirePrivacyWaiver("google", "Connect Google (Gmail & Calendar)", () => {
        window.location.assign("/api/connect/google");
      });
      return;
    }
    if (action === "microsoft") {
      requirePrivacyWaiver("microsoft", "Connect Microsoft (Outlook & Calendar)", () => {
        window.location.assign("/api/connect/microsoft");
      });
      return;
    }
    if (action === "slack") {
      requirePrivacyWaiver("slack", "Connect Slack", () => {
        window.location.assign("/api/connect/slack");
      });
      return;
    }
    if (!supportsDeviceFolderPicker()) {
      setDeviceError("This browser cannot pick folders. Use Safari or Chrome on desktop.");
      return;
    }
    requirePrivacyWaiver("device", "Connect this device folder", () => {
      void (async () => {
        const userId = readSession()?.userId;
        if (!userId) return;
        setDeviceError(null);
        const result = await connectDeviceFolder(userId);
        if (result.ok) {
          const next = readConnectedServices(userId);
          next.services.deviceFiles = {
            connected: true,
            label:
              result.mode === "webkit"
                ? `${result.rootName} (Safari snapshot — plan only; use Chrome to apply moves)`
                : `${result.rootName} (read & organize)`,
          };
          persistLocal(next);
          return;
        }
        if ("cancelled" in result && result.cancelled) return;
        if ("error" in result) setDeviceError(result.error);
      })();
    });
  };

  const disconnectDevice = () => {
    void idbClearDeviceHandle(readSession()?.userId);
    const next = readConnectedServices(readSession()?.userId);
    next.services.deviceFiles = { connected: false };
    persistLocal(next);
  };

  const status = oauth ?? emptyStatus();
  const configured = status.configured ?? false;

  const connectionFor = (
    entry: ConnectorCatalogEntry,
  ): { connected: boolean; detail?: string; available: boolean } => {
    if (entry.status === "coming_soon" || !entry.connectAction) {
      return { connected: false, available: false };
    }
    if (entry.connectAction === "google") {
      return {
        connected: Boolean(status.google.connected),
        detail: status.google.email,
        available: status.google.available !== false,
      };
    }
    if (entry.connectAction === "microsoft") {
      return {
        connected: Boolean(status.microsoft.connected),
        detail: status.microsoft.email,
        available: status.microsoft.available !== false,
      };
    }
    if (entry.connectAction === "slack") {
      return {
        connected: Boolean(status.slack?.connected),
        detail: status.slack?.team,
        available: status.slack?.available !== false,
      };
    }
    return {
      connected: local.services.deviceFiles.connected,
      detail: local.services.deviceFiles.label,
      available: true,
    };
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-[var(--text-primary)]">Connectors directory</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          First-party OAuth connectors plus a full directory of what you can connect. Live ones
          authenticate under your account; others show as coming soon. For custom APIs, use{" "}
          <Link href="/settings?tab=mcp" className="text-[var(--accent)] hover:underline">
            MCP
          </Link>
          .
        </p>
      </div>

      {status.needsSignInForConnect && configured ? (
        <p className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[0.7rem] text-sky-100/95">
          <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          so Google, Microsoft, and Slack connect to your account.
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[0.7rem] text-amber-100/90">
          Set <code className="text-[0.6rem]">SMILE_APP_SECRET</code> plus provider client IDs to
          enable OAuth connections.
        </p>
      ) : null}

      {connectError || oauthError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[0.7rem] text-red-100/95">
          {connectError ?? oauthError}
        </p>
      ) : null}

      {deviceError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[0.7rem] text-red-100/95">
          {deviceError}
        </p>
      ) : null}

      {CONNECTOR_CATEGORIES.map((category) => {
        const items = CONNECTORS_CATALOG.filter((c) => c.category === category);
        if (items.length === 0) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
              {category}
            </p>
            <ul className="space-y-2">
              {items.map((entry) => {
                const conn = connectionFor(entry);
                const busy =
                  entry.connectAction && oauthBusy === entry.connectAction
                    ? true
                    : false;
                return (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-medium text-[var(--text-primary)]">
                            {entry.name}
                          </p>
                          {entry.status === "coming_soon" ? (
                            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                              Soon
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[0.65rem] leading-relaxed text-[var(--text-faint)]">
                          {entry.description}
                        </p>
                        {conn.connected ? (
                          <p className="mt-1 truncate text-[0.65rem] text-emerald-200/90">
                            {conn.detail ?? "Connected"}
                          </p>
                        ) : entry.status === "live" ? (
                          <p className="mt-1 text-[0.65rem] text-[var(--text-faint)]">
                            Not connected
                          </p>
                        ) : null}
                      </div>
                      {entry.status === "coming_soon" ? (
                        <span className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[0.65rem] text-[var(--text-faint)]">
                          Coming soon
                        </span>
                      ) : conn.connected ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (entry.connectAction === "device") disconnectDevice();
                            else if (entry.connectAction)
                              void disconnectProvider(entry.connectAction);
                          }}
                          className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                        >
                          {entry.connectAction === "device" ? "Clear" : "Disconnect"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!conn.available || busy}
                          onClick={() => {
                            if (entry.connectAction) startConnect(entry.connectAction);
                          }}
                          className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {entry.connectAction === "device" ? "Choose…" : "Connect"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <PrivacyWaiverModal
        open={waiverOpen}
        title={waiverTitle}
        onCancel={() => {
          setWaiverOpen(false);
          pendingConnectRef.current = null;
        }}
        onAccept={() => {
          const userId = readSession()?.userId;
          if (userId) recordPrivacyWaiverAcceptance(userId);
          setWaiverOpen(false);
          const action = pendingConnectRef.current;
          pendingConnectRef.current = null;
          action?.();
        }}
      />
    </div>
  );
}
