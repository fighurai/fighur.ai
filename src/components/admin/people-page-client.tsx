"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { prettyPlaceLabel } from "@/lib/geo-labels";
import type { PresenceEvent, PresenceVisitor } from "@/lib/presence-store";

type Stats = {
  total: number;
  accounts: number;
  guests: number;
  active15m: number;
  countries: number;
  instagram?: number;
};

type Payload = {
  ok?: boolean;
  error?: string;
  stats?: Stats;
  people?: PresenceVisitor[];
  events?: PresenceEvent[];
};

type Filter = "all" | "accounts" | "guests" | "instagram" | "canada" | "united-states";

function actionLabel(action: string): string {
  switch (action) {
    case "page.view":
      return "Opened the site";
    case "auth.sign_up":
      return "Created an account";
    case "auth.sign_in":
      return "Signed in";
    case "auth.sign_in_sso":
      return "Signed in with SSO";
    case "chat.request":
      return "Used chat";
    case "account.delete":
      return "Deleted account";
    default:
      return action;
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function locationText(loc?: PresenceVisitor["lastLocation"]): string {
  if (!loc) return "Location unknown";
  return (
    prettyPlaceLabel(loc) ||
    loc.label ||
    [loc.city, loc.region, loc.country].filter(Boolean).join(", ") ||
    "Location unknown"
  );
}

function placeHay(loc?: PresenceVisitor["lastLocation"]): string {
  if (!loc) return "";
  return [locationText(loc), loc.city, loc.region, loc.country, loc.countryCode].filter(Boolean).join(" ");
}

function isCanada(row: PresenceVisitor): boolean {
  const hay = placeHay(row.lastLocation).toLowerCase();
  return hay.includes("canada") || row.lastLocation?.countryCode === "CA";
}

function isUnitedStates(row: PresenceVisitor): boolean {
  const hay = placeHay(row.lastLocation).toLowerCase();
  return (
    hay.includes("united states") ||
    hay.includes("south carolina") ||
    row.lastLocation?.countryCode === "US"
  );
}

export function PeoplePageClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/presence", { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as Payload;
      if (!res.ok) {
        setError(json.error || "Could not load people.");
        setData(null);
        return;
      }
      setError(null);
      setData(json);
    } catch {
      setError("Could not load people.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const people = useMemo(() => {
    const rows = data?.people ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "accounts" && !row.hasAccount) return false;
      if (filter === "guests" && row.hasAccount) return false;
      if (
        filter === "instagram" &&
        row.firstSource !== "Instagram" &&
        row.lastSource !== "Instagram"
      ) {
        return false;
      }
      if (filter === "canada" && !isCanada(row)) return false;
      if (filter === "united-states" && !isUnitedStates(row)) return false;
      if (!q) return true;
      const hay = [
        row.email,
        row.name,
        row.userId,
        row.lastDevice,
        row.lastPath,
        row.landingPath,
        row.firstSource,
        row.lastSource,
        row.referrer,
        placeHay(row.lastLocation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data?.people, filter, query]);

  const stats = data?.stats;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Admin
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            People
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            New opens are tagged with Vercel city / region / country on the first request — so South
            Carolina and Canada show as those names, not just a guest row. Visits from before this
            geo tracker still cannot be rebuilt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Back to chat
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}{" "}
          {error.toLowerCase().includes("sign in") ? (
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Seen", stats?.total ?? "—"],
          ["Accounts", stats?.accounts ?? "—"],
          ["Guests", stats?.guests ?? "—"],
          ["Instagram", stats?.instagram ?? "—"],
          ["Countries", stats?.countries ?? "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--text-faint)]">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
          {(
            [
              ["all", "Everyone"],
              ["accounts", "Accounts"],
              ["guests", "Guests"],
              ["instagram", "Instagram"],
              ["canada", "Canada"],
              ["united-states", "United States"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === id
                  ? "bg-[var(--accent)] text-[var(--bg-deep)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search South Carolina, Canada, Instagram…"
          className="w-full rounded-full border border-white/[0.1] bg-black/30 px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] sm:max-w-sm"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-[0.65rem] uppercase tracking-wide text-[var(--text-faint)]">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Came from</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Where / device</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                    {busy
                      ? "Loading…"
                      : "No visits recorded yet. New Instagram and hyperlink taps will show here as soon as someone opens fighur.ai."}
                  </td>
                </tr>
              ) : (
                people.map((row) => (
                  <tr key={row.key} className="border-t border-white/[0.06] align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-primary)]">
                        {row.email || row.name || "Guest"}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">
                        {row.hasAccount
                          ? `${row.authProvider || "account"} · ${row.plan || "free"}`
                          : "Anonymous visitor"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                          row.hasAccount
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "bg-white/[0.06] text-[var(--text-muted)]"
                        }`}
                      >
                        {row.hasAccount ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text-primary)]">
                        {row.firstSource || row.lastSource || "Direct / unknown"}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">
                        {row.landingPath || row.referrer || "No landing path"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text-primary)]">{locationText(row.lastLocation)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">
                        {row.lastLocation?.source ? `via ${row.lastLocation.source}` : "No geo yet"}
                        {row.lastIp ? ` · ${row.lastIp}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text-primary)]">{row.lastPath || "—"}</p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">
                        {row.lastDevice || "Unknown device"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[var(--text-primary)]">{relativeTime(row.lastSeenAt)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--text-faint)]">
                        {actionLabel(row.lastAction)}
                        {row.visitCount ? ` · ${row.visitCount} visits` : ""}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Recent activity</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Page opens from Instagram and other links, plus sign-ins and chat, after server-side
          tracking shipped.
        </p>
        <ul className="mt-3 space-y-2">
          {(data?.events ?? []).length === 0 ? (
            <li className="text-sm text-[var(--text-muted)]">No events yet.</li>
          ) : (
            (data?.events ?? []).map((event) => (
              <li
                key={event.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-[var(--text-primary)]">
                    {event.email || (event.hasAccount ? "Account" : "Guest")} · {actionLabel(event.action)}
                  </p>
                  <p className="text-[0.7rem] text-[var(--text-faint)]">{relativeTime(event.ts)}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {event.source ? `${event.source} · ` : ""}
                  {locationText(event.location)}
                  {event.path ? ` · ${event.path}` : ""}
                  {event.device ? ` · ${event.device}` : ""}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
