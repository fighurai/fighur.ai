"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";

async function fetchConnectStatus(): Promise<ConnectStatusResponse> {
  const res = await fetch("/api/connect/status", { cache: "no-store" });
  return (await res.json()) as ConnectStatusResponse;
}

export function SettingsControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [oauth, setOauth] = useState<ConnectStatusResponse | null>(null);
  const [local, setLocal] = useState<ConnectedServicesState>(() => readConnectedServices());
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const refreshOauth = useCallback(async () => {
    try {
      setOauth(await fetchConnectStatus());
    } catch {
      setOauth(null);
    }
  }, []);

  const refreshLocal = useCallback(() => setLocal(readConnectedServices()), []);

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
    const oauthError = u.searchParams.get("oauth_error");
    if (connected || oauthError) {
      void refreshOauth();
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
    writeConnectedServices(next);
  }, []);

  const toggleCowork = () => {
    persistLocal({ ...local, coworkDevice: !local.coworkDevice });
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
    } finally {
      setOauthBusy(null);
    }
  };

  const startOAuthConnect = async (path: "/api/connect/google" | "/api/connect/microsoft" | "/api/connect/slack") => {
    setConnectError(null);
    const res = await fetch(path, { redirect: "manual", credentials: "include" });
    if (res.status === 401) {
      setConnectError("Sign in first — connections are saved to your private folder on this server.");
      return;
    }
    const loc = res.headers.get("Location");
    if (loc) {
      window.location.assign(loc);
      return;
    }
    if (res.status === 302 || res.status === 303 || res.status === 307) {
      setConnectError("Could not read redirect URL. Try again or use a same-origin URL.");
      return;
    }
    try {
      const j = (await res.json()) as { error?: string };
      setConnectError(j.error ?? `Could not start OAuth (${res.status}).`);
    } catch {
      setConnectError(`Could not start OAuth (${res.status}).`);
    }
  };

  const connectGoogle = () => void startOAuthConnect("/api/connect/google");
  const connectMicrosoft = () => void startOAuthConnect("/api/connect/microsoft");
  const connectSlack = () => void startOAuthConnect("/api/connect/slack");

  const connectDeviceFolder = async () => {
    setDeviceError(null);
    const w = window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    };
    const picker = w.showDirectoryPicker?.bind(window);
    if (!picker) {
      setDeviceError("This browser does not support folder pickers (try Chrome desktop).");
      return;
    }
    try {
      const handle = await picker();
      const next = readConnectedServices();
      next.services.deviceFiles = { connected: true, label: handle.name };
      persistLocal(next);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setDeviceError(e instanceof Error ? e.message : "Could not open folder.");
      }
    }
  };

  const disconnectDevice = () => {
    const next = readConnectedServices();
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
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(36rem,78vh)] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">Connections</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            After you sign in, OAuth tokens are encrypted and stored under your user id on this server (not
            only in the browser). Use <code className="text-[0.65rem]">SMILE_OAUTH_BASE_URL</code> matching
            the URL you registered (e.g. <code className="text-[0.65rem]">http://localhost:3099</code>).
          </p>
          {oauth?.needsSignInForConnect && configured ? (
            <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[0.65rem] text-sky-100/95">
              <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              so Google, Microsoft, and Slack connect to your account folder.
            </p>
          ) : null}
          {!configured ? (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[0.65rem] text-amber-100/90">
              Set <code className="text-[0.6rem]">SMILE_APP_SECRET</code> or{" "}
              <code className="text-[0.6rem]">SMILE_OAUTH_COOKIE_SECRET</code> (16+ chars) plus Google /
              Microsoft / Slack client IDs to enable sign-in flows.
            </p>
          ) : null}
          {connectError ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[0.65rem] text-red-100/95">
              {connectError}
            </p>
          ) : null}

          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={local.coworkDevice}
              onChange={toggleCowork}
              className="mt-0.5 rounded border-white/20"
            />
            <span>
              <span className="font-medium text-[var(--text-primary)]">Cowork-style device help</span>
              <span className="mt-0.5 block text-[0.7rem] text-[var(--text-faint)]">
                Plans for organizing files and drafts. Pair with{" "}
                <span className="font-medium text-[var(--text-primary)]">This device</span> below to pick a
                folder (browser-supported).
              </span>
            </span>
          </label>

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
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                  >
                    Connect
                  </button>
                )}
              </div>
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
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                  >
                    Connect
                  </button>
                )}
              </div>
            </li>

            <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Slack</p>
                  {oauth?.slack.connected ? (
                    <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                      {[oauth.slack.email, oauth.slack.team].filter(Boolean).join(" · ") || "Connected"}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Not connected</p>
                  )}
                </div>
                {oauth?.slack.connected ? (
                  <button
                    type="button"
                    disabled={oauthBusy === "slack"}
                    onClick={() => void disconnectProvider("slack")}
                    className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectSlack}
                    className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                  >
                    Connect
                  </button>
                )}
              </div>
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
                    onClick={() => void connectDeviceFolder()}
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

          <p className="mt-3 text-[0.65rem] leading-relaxed text-[var(--text-faint)]">
            Redirect URIs to register:{" "}
            <code className="break-all text-[0.6rem] text-[var(--text-muted)]">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/connect/google/callback
            </code>
            , same host for <code className="text-[0.6rem]">microsoft/callback</code> and{" "}
            <code className="text-[0.6rem]">slack/callback</code>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
