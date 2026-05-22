"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import { readSession } from "@/lib/auth-storage";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";
import {
  connectDeviceFolder,
  idbClearDeviceHandle,
  supportsDeviceFolderPicker,
} from "@/lib/device-files-client";
import { WORK_MODE_OPTIONS, workModeLabel, type WorkMode } from "@/lib/work-mode";

async function fetchConnectStatus(): Promise<ConnectStatusResponse> {
  const res = await fetch("/api/connect/status", { cache: "no-store" });
  return (await res.json()) as ConnectStatusResponse;
}

const OAUTH_ERROR_HINTS: Record<string, string> = {
  storage_failed: "Could not save the connection. Try again after signing in.",
  invalid_callback: "OAuth state expired. Open Settings and click Connect again.",
  bad_state: "OAuth state mismatch. Click Connect again.",
  missing_google_env: "Google OAuth is not configured on the server.",
  missing_microsoft_env: "Microsoft OAuth is not configured on the server.",
  access_denied: "You cancelled or Google denied access.",
};

export function SettingsControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [oauth, setOauth] = useState<ConnectStatusResponse | null>(null);
  const [local, setLocal] = useState<ConnectedServicesState>(() =>
    readConnectedServices(readSession()?.userId),
  );
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const refreshOauth = useCallback(async () => {
    try {
      setOauth(await fetchConnectStatus());
    } catch {
      setOauth(null);
    }
  }, []);

  const refreshLocal = useCallback(
    () => setLocal(readConnectedServices(readSession()?.userId)),
    [],
  );

  useEffect(() => {
    refreshLocal();
    const on = () => refreshLocal();
    window.addEventListener("smile-connected-services-changed", on);
    return () => window.removeEventListener("smile-connected-services-changed", on);
  }, [refreshLocal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const connected = u.searchParams.get("connected");
    const oauthErr = u.searchParams.get("oauth_error");
    if (connected || oauthErr) {
      void refreshOauth();
      if (oauthErr) {
        setOauthError(OAUTH_ERROR_HINTS[oauthErr] ?? `Connection error: ${oauthErr}`);
      }
      u.searchParams.delete("connected");
      u.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", `${u.pathname}${u.search}`);
    }
  }, [refreshOauth]);

  useEffect(() => {
    if (open) {
      setConnectError(null);
      void refreshOauth();
    }
  }, [open, refreshOauth]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const persistLocal = useCallback((next: ConnectedServicesState) => {
    setLocal(next);
    writeConnectedServices(next, readSession()?.userId);
  }, []);

  const setWorkMode = (workMode: WorkMode) => {
    persistLocal({
      ...local,
      workMode,
      coworkDevice: workMode === "cowork",
    });
  };

  const disconnectProvider = async (provider: "google" | "microsoft") => {
    setOauthBusy(provider);
    try {
      await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      await refreshOauth();
    } finally {
      setOauthBusy(null);
    }
  };

  const startOAuthConnect = (path: "/api/connect/google" | "/api/connect/microsoft") => {
    setConnectError(null);
    setOauthError(null);
    if (oauth?.needsSignInForConnect) {
      setConnectError("Sign in first — connections are saved to your account on this server.");
      return;
    }
    window.location.assign(path);
  };

  const connectGoogle = () => startOAuthConnect("/api/connect/google");
  const connectMicrosoft = () => startOAuthConnect("/api/connect/microsoft");

  const connectDeviceFolderHandler = async () => {
    setDeviceError(null);
    const userId = readSession()?.userId;
    if (!userId) {
      setDeviceError("Sign in to link a folder to your account.");
      return;
    }
    if (!supportsDeviceFolderPicker()) {
      setDeviceError("This browser cannot pick folders. Use Safari or Chrome on desktop.");
      return;
    }
    const result = await connectDeviceFolder(userId);
    if (result.ok) {
      const next = readConnectedServices(userId);
      next.services.deviceFiles = {
        connected: true,
        label:
          result.mode === "webkit"
            ? `${result.rootName} (Safari snapshot — reconnect to refresh files)`
            : result.rootName,
      };
      persistLocal(next);
      return;
    }
    if ("cancelled" in result && result.cancelled) return;
    if ("error" in result) setDeviceError(result.error);
  };

  const disconnectDevice = () => {
    void idbClearDeviceHandle(readSession()?.userId);
    const next = readConnectedServices(readSession()?.userId);
    next.services.deviceFiles = { connected: false };
    persistLocal(next);
  };

  const configured = oauth?.configured ?? false;

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Settings
        {local.workMode !== "chat" ? (
          <span className="ml-1.5 rounded-full bg-[var(--accent)]/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-[var(--accent)]">
            {workModeLabel(local.workMode)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(36rem,78vh)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">Work mode</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            Choose how FIGHURAI behaves—modeled on Anthropic{" "}
            <span className="text-[var(--text-muted)]">CoWork</span> (knowledge work) and OpenAI{" "}
            <span className="text-[var(--text-muted)]">Codex</span> (coding agent). Not a separate product login.
          </p>
          <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Work mode">
            {WORK_MODE_OPTIONS.map((opt) => {
              const selected = local.workMode === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setWorkMode(opt.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-[var(--accent)]/45 bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/25"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{opt.label}</span>
                      <span className="text-[0.6rem] text-[var(--text-faint)]">{opt.inspiredBy}</span>
                    </div>
                    <p className="mt-0.5 text-[0.65rem] font-medium text-[var(--accent)]/90">{opt.tagline}</p>
                    <p className="mt-1 text-[0.65rem] leading-relaxed text-[var(--text-faint)]">
                      {opt.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-xs font-semibold text-[var(--text-primary)]">Connections</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            Sign in first, then connect accounts. Tokens are encrypted on this server and in httpOnly cookies
            tied to your user id.
          </p>
          {oauth?.needsSignInForConnect && configured ? (
            <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[0.65rem] text-sky-100/95">
              <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              so Google and Microsoft connect to your account.
            </p>
          ) : null}
          {!configured ? (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[0.65rem] text-amber-100/90">
              Set <code className="text-[0.6rem]">SMILE_APP_SECRET</code> or{" "}
              <code className="text-[0.6rem]">SMILE_OAUTH_COOKIE_SECRET</code> (16+ chars) plus Google /
              Microsoft client IDs to enable sign-in and connections.
            </p>
          ) : null}
          {connectError || oauthError ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[0.65rem] text-red-100/95">
              {connectError ?? oauthError}
            </p>
          ) : null}

          {local.workMode === "cowork" ? (
            <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/8 px-2.5 py-2 text-[0.65rem] leading-relaxed text-sky-100/90">
              <span className="font-medium">CoWork tip:</span> connect{" "}
              <span className="font-medium">This device · folder</span> below for file-organizing plans and
              local scripts.
            </p>
          ) : null}
          {local.workMode === "codex" ? (
            <p className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/8 px-2.5 py-2 text-[0.65rem] leading-relaxed text-violet-100/90">
              <span className="font-medium">Codex tip:</span> ask to build, fix, or refactor code—outputs route to
              the Build workspace when you use fenced code blocks.
            </p>
          ) : null}

          <p className="mt-4 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
            Accounts (OAuth)
          </p>
          <ul className="mt-2 space-y-2">
            <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Google · Gmail & Calendar</p>
                  {oauth?.google.connected ? (
                    <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                      {oauth.google.email ?? "Connected"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Not connected</p>
                  )}
                </div>
                {oauth?.google.connected ? (
                  <button
                    type="button"
                    disabled={oauthBusy === "google"}
                    onClick={() => void disconnectProvider("google")}
                    className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectGoogle}
                    disabled={oauth?.google.available === false}
                    title={
                      oauth?.google.available === false
                        ? "Set GOOGLE_CLIENT_ID on the server (same app as Google sign-in)"
                        : undefined
                    }
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Connect
                  </button>
                )}
              </div>
              {oauth?.google.available === false ? (
                <p className="mt-1 text-[0.6rem] text-amber-200/80">Server: add Google OAuth env vars</p>
              ) : null}
            </li>

            <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Microsoft · Outlook & 365</p>
                  {oauth?.microsoft.connected ? (
                    <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                      {oauth.microsoft.email ?? "Connected"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Not connected</p>
                  )}
                </div>
                {oauth?.microsoft.connected ? (
                  <button
                    type="button"
                    disabled={oauthBusy === "microsoft"}
                    onClick={() => void disconnectProvider("microsoft")}
                    className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectMicrosoft}
                    disabled={oauth?.microsoft.available === false}
                    title={
                      oauth?.microsoft.available === false
                        ? "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET on the server"
                        : undefined
                    }
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Connect
                  </button>
                )}
              </div>
              {oauth?.microsoft.available === false ? (
                <p className="mt-1 text-[0.6rem] text-amber-200/80">Server: add Azure app env vars</p>
              ) : null}
            </li>

            <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">This device · folder</p>
                  {local.services.deviceFiles.connected ? (
                    <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                      {local.services.deviceFiles.label ?? "Folder granted"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Pick a folder (Chrome)</p>
                  )}
                </div>
                {local.services.deviceFiles.connected ? (
                  <button
                    type="button"
                    onClick={disconnectDevice}
                    className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12]"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connectDeviceFolderHandler()}
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                  >
                    Choose…
                  </button>
                )}
              </div>
              {deviceError ? (
                <p className="mt-2 text-[0.65rem] text-red-300/90">{deviceError}</p>
              ) : null}
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
