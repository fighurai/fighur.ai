"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { readSession } from "@/lib/auth-storage";
import {
  listConversationBuilds,
  type ConversationBuildRow,
} from "@/lib/conversation-builds";

type AppRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  slug: string;
  fileCount: number;
  deployedUrl?: string;
  updatedAt: string;
};

export function SettingsAppsPanel() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [builds, setBuilds] = useState<ConversationBuildRow[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [plan, setPlan] = useState<"free" | "pro" | null>(readSession()?.plan ?? null);
  const signedIn = Boolean(readSession()?.userId);
  const isPro = plan === "pro";

  const refresh = useCallback(async () => {
    setBuilds(listConversationBuilds(readSession()?.userId));
    setAppsError(null);
    const local = readSession();
    setPlan(local?.plan ?? null);
    if (!local?.userId) {
      setApps([]);
      return;
    }
    try {
      const res = await fetch("/api/apps", { cache: "no-store" });
      if (res.status === 401) {
        setApps([]);
        return;
      }
      const data = (await res.json()) as { apps?: AppRow[]; error?: string };
      if (!res.ok) {
        setAppsError(data.error ?? "Failed to load apps");
        return;
      }
      setApps(Array.isArray(data.apps) ? data.apps : []);
    } catch {
      setAppsError("Failed to load apps");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuth = () => void refresh();
    window.addEventListener("smile-auth-changed", onAuth);
    return () => window.removeEventListener("smile-auth-changed", onAuth);
  }, [refresh]);

  const archiveApp = async (id: string) => {
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", id }),
    });
    if (res.ok) void refresh();
  };

  const publishApp = async (id: string) => {
    setAppsError(null);
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setAppsError(data.error ?? "Publish failed");
      return;
    }
    void refresh();
  };

  const unpublishApp = async (id: string) => {
    setAppsError(null);
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish", id }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setAppsError(data.error ?? "Unpublish failed");
      return;
    }
    void refresh();
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Chrome extensions</h3>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          Desktop browser tools included with your plan.
        </p>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">FIGHURAI Colors</p>
              <p className="mt-1 text-[0.65rem] leading-relaxed text-[var(--text-muted)]">
                Chrome extension (Simplify-style): pin it, then open Colors on any website — same
                background and text controls as on FIGHURAI.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-0.5 text-[0.6rem] font-semibold text-[var(--accent)]">
              Pro
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/extension"
              className="inline-flex rounded-full bg-[var(--accent)] px-3 py-1.5 text-[0.7rem] font-semibold text-[var(--accent-foreground)]"
            >
              {isPro ? "Add to Chrome" : "View install guide"}
            </Link>
            {isPro ? (
              <a
                href="/api/extension/download"
                download="fighur-page-theme.zip"
                className="inline-flex rounded-full border border-white/[0.12] px-3 py-1.5 text-[0.7rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.06]"
              >
                Download zip
              </a>
            ) : (
              <Link
                href="/upgrade"
                className="inline-flex rounded-full border border-white/[0.12] px-3 py-1.5 text-[0.7rem] font-medium text-[var(--accent)]"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Saved apps</h3>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          Projects saved with <code className="text-[0.65rem]">save_app</code>. Publish for a live URL
          at <code className="text-[0.65rem]">/a/&lt;slug&gt;</code>.
        </p>
        {!signedIn ? (
          <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[0.7rem] text-sky-100/95">
            <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to sync and manage saved apps across devices.
          </p>
        ) : null}
        {appsError ? <p className="mt-2 text-[0.7rem] text-red-300/90">{appsError}</p> : null}
        {apps.length === 0 && signedIn ? (
          <p className="mt-3 text-[0.7rem] text-[var(--text-faint)]">
            No saved apps yet. Build in chat, then ask FIGHURAI to save this app.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{app.name}</p>
                  <p className="mt-0.5 text-[0.6rem] text-[var(--text-faint)]">
                    {app.slug} · {app.fileCount} files · {app.status}
                  </p>
                  {app.deployedUrl ? (
                    <a
                      href={app.deployedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-[0.65rem] text-[var(--accent)] hover:underline"
                    >
                      {app.deployedUrl}
                    </a>
                  ) : null}
                  {app.description ? (
                    <p className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                      {app.description.slice(0, 140)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {app.status === "deployed" ? (
                    <button
                      type="button"
                      onClick={() => void unpublishApp(app.id)}
                      className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.65rem] text-amber-100 ring-1 ring-amber-400/30 hover:bg-amber-500/25"
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void publishApp(app.id)}
                      className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                    >
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void archiveApp(app.id)}
                    className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] text-[var(--text-muted)] hover:bg-white/[0.12]"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Built in conversations</h3>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          Canvas / code builds still attached to chats on this device — including drafts not yet saved
          as apps.
        </p>
        {builds.length === 0 ? (
          <p className="mt-3 text-[0.7rem] text-[var(--text-faint)]">
            No conversation builds yet. Generate an app or page in chat to see it here.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {builds.map((b) => (
            <li
              key={`${b.scope}:${b.conversationId}`}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    {b.title}
                  </p>
                  <p className="mt-0.5 text-[0.6rem] text-[var(--text-faint)]">
                    {b.language}
                    {b.primaryPath ? ` · ${b.primaryPath}` : ""} · {b.fileCount} file
                    {b.fileCount === 1 ? "" : "s"}
                    {b.incomplete ? " · incomplete" : ""} ·{" "}
                    {new Date(b.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/?conversation=${encodeURIComponent(b.conversationId)}`}
                  className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[0.65rem] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/30 hover:bg-[var(--accent)]/25"
                >
                  Open chat
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
