"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { readSession } from "@/lib/auth-storage";
import {
  emptyMcpConfig,
  parseMcpServersConfig,
  type McpServerConfig,
  type McpServersConfig,
} from "@/lib/mcp/types";

type ProbeResult = {
  serverId: string;
  ok: boolean;
  error?: string;
  tools?: Array<{ name?: string; description?: string }>;
};

type DraftServer = {
  id: string;
  name: string;
  url: string;
  authHeader: string;
  enabled: boolean;
};

const LOCAL_KEY = "fighur-mcp-config";
const DISABLED_KEY = "fighur-mcp-disabled";

function configToDrafts(config: McpServersConfig, disabled: Set<string>): DraftServer[] {
  return Object.entries(config.mcpServers).map(([id, cfg]) => {
    const headers =
      "url" in cfg && typeof cfg.url === "string" ? (cfg.headers ?? {}) : {};
    const auth =
      headers.Authorization ||
      headers.authorization ||
      headers["X-Api-Key"] ||
      headers["x-api-key"] ||
      "";
    return {
      id,
      name: cfg.name || id,
      url: "url" in cfg && typeof cfg.url === "string" ? cfg.url : "",
      authHeader: auth,
      enabled: !disabled.has(id),
    };
  });
}

function draftsToConfig(drafts: DraftServer[]): McpServersConfig {
  const mcpServers: Record<string, McpServerConfig> = {};
  for (const d of drafts) {
    const id = d.id.trim();
    if (!id || !d.url.trim()) continue;
    const headers: Record<string, string> = {};
    if (d.authHeader.trim()) {
      const v = d.authHeader.trim();
      headers.Authorization = v.toLowerCase().startsWith("bearer ") ? v : `Bearer ${v}`;
    }
    mcpServers[id] = {
      url: d.url.trim(),
      name: d.name.trim() || undefined,
      headers: Object.keys(headers).length ? headers : undefined,
    };
  }
  return { mcpServers };
}

function readDisabled(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISABLED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDisabled(ids: Set<string>) {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function SettingsMcpPanel() {
  const [signedIn, setSignedIn] = useState(false);
  const [drafts, setDrafts] = useState<DraftServer[]>([]);
  const [jsonMode, setJsonMode] = useState(false);
  const [mcpJson, setMcpJson] = useState('{\n  "mcpServers": {}\n}');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ id: "", name: "", url: "", authHeader: "" });

  const refresh = useCallback(async () => {
    const disabled = readDisabled();
    try {
      const res = await fetch("/api/mcp", { cache: "no-store" });
      const data = (await res.json()) as {
        signedIn?: boolean;
        config?: McpServersConfig;
      };
      setSignedIn(Boolean(data.signedIn));
      if (data.config && Object.keys(data.config.mcpServers ?? {}).length > 0) {
        setDrafts(configToDrafts(data.config, disabled));
        setMcpJson(JSON.stringify(data.config, null, 2));
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(data.config, null, 2));
        } catch {
          /* ignore */
        }
        return;
      }
    } catch {
      setSignedIn(false);
    }
    try {
      const saved = localStorage.getItem(LOCAL_KEY);
      if (saved) {
        const parsed = parseMcpServersConfig(JSON.parse(saved));
        setDrafts(configToDrafts(parsed, disabled));
        setMcpJson(JSON.stringify(parsed, null, 2));
        return;
      }
    } catch {
      /* ignore */
    }
    setDrafts([]);
    setMcpJson(JSON.stringify(emptyMcpConfig(), null, 2));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeCount = useMemo(() => drafts.filter((d) => d.enabled).length, [drafts]);

  const syncJsonFromDrafts = (next: DraftServer[]) => {
    const cfg = draftsToConfig(next);
    setMcpJson(JSON.stringify(cfg, null, 2));
  };

  const persistDisabled = (next: DraftServer[]) => {
    writeDisabled(new Set(next.filter((d) => !d.enabled).map((d) => d.id)));
  };

  const save = async (overrideDrafts?: DraftServer[], overrideJson?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      let parsed: McpServersConfig;
      if (jsonMode || overrideJson !== undefined) {
        parsed = parseMcpServersConfig(JSON.parse(overrideJson ?? mcpJson));
      } else {
        parsed = draftsToConfig(overrideDrafts ?? drafts);
      }
      const text = JSON.stringify(parsed, null, 2);
      localStorage.setItem(LOCAL_KEY, text);
      setMcpJson(text);
      setDrafts(configToDrafts(parsed, readDisabled()));
      persistDisabled(overrideDrafts ?? drafts);

      if (signedIn || readSession()?.userId) {
        const res = await fetch("/api/mcp", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: text,
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setMsg(data.error || "Save failed");
          return;
        }
        setMsg("Saved. Enabled remote HTTP/SSE servers are callable in chat.");
      } else {
        setMsg("Saved in this browser. Sign in to sync across devices.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid config");
    } finally {
      setBusy(false);
    }
  };

  const probe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const cfg = jsonMode
        ? parseMcpServersConfig(JSON.parse(mcpJson))
        : draftsToConfig(drafts.filter((d) => d.enabled));
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe", config: cfg }),
      });
      const data = (await res.json()) as { error?: string; probes?: ProbeResult[] };
      if (!res.ok) {
        setMsg(data.error || "Probe failed");
        return;
      }
      setProbes(data.probes ?? []);
      const lines = (data.probes ?? []).map((p) =>
        p.ok
          ? `${p.serverId}: ok (${p.tools?.length ?? 0} tools)`
          : `${p.serverId}: ${p.error || "failed"}`,
      );
      setMsg(lines.length ? lines.join(" · ") : "No servers configured");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setBusy(false);
    }
  };

  const addServer = () => {
    const id = addForm.id.trim().replace(/\s+/g, "-").slice(0, 48);
    if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
      setMsg("Server id must start with a letter/number and use only . _ -");
      return;
    }
    if (!addForm.url.trim()) {
      setMsg("Remote MCP URL is required.");
      return;
    }
    if (drafts.some((d) => d.id === id)) {
      setMsg(`Server "${id}" already exists.`);
      return;
    }
    const next = [
      ...drafts,
      {
        id,
        name: addForm.name.trim() || id,
        url: addForm.url.trim(),
        authHeader: addForm.authHeader,
        enabled: true,
      },
    ];
    setDrafts(next);
    syncJsonFromDrafts(next);
    setAddForm({ id: "", name: "", url: "", authHeader: "" });
    setAddOpen(false);
    void save(next);
  };

  const removeServer = (id: string) => {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    syncJsonFromDrafts(next);
    persistDisabled(next);
    void save(next);
  };

  const toggleEnabled = (id: string) => {
    const next = drafts.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d));
    setDrafts(next);
    persistDisabled(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-[var(--text-primary)]">MCP servers</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          Add remote MCP servers the way Claude and Abacus do — name + URL, optional auth header,
          then test tools. Hosted FigHur runs <strong>HTTP/SSE</strong> servers only. Stdio{" "}
          <code className="text-[0.6rem]">command</code> entries can be pasted in Advanced JSON for
          desktop hosts later.
        </p>
        {!signedIn ? (
          <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[0.7rem] text-sky-100/95">
            <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to sync MCP config across devices ({activeCount} enabled on this browser).
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="rounded-full bg-[var(--accent)]/15 px-3 py-1.5 text-[0.7rem] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 hover:bg-[var(--accent)]/25"
        >
          {addOpen ? "Cancel" : "+ Add custom MCP"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void probe()}
          className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-50"
        >
          Test connection
        </button>
        <button
          type="button"
          onClick={() => {
            if (!jsonMode) syncJsonFromDrafts(drafts);
            setJsonMode((v) => !v);
          }}
          className="rounded-full border border-white/[0.1] px-3 py-1.5 text-[0.7rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {jsonMode ? "Form view" : "Advanced JSON"}
        </button>
      </div>

      {addOpen ? (
        <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Add custom connector</p>
          <label className="block text-[0.65rem] text-[var(--text-muted)]">
            Server id
            <input
              value={addForm.id}
              onChange={(e) => setAddForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="github"
              className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-[0.65rem] text-[var(--text-muted)]">
            Display name
            <input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="GitHub MCP"
              className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-[0.65rem] text-[var(--text-muted)]">
            Remote MCP URL
            <input
              value={addForm.url}
              onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://mcp.example.com/sse"
              className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-[0.65rem] text-[var(--text-muted)]">
            Auth token / API key (optional)
            <input
              value={addForm.authHeader}
              onChange={(e) => setAddForm((f) => ({ ...f, authHeader: e.target.value }))}
              placeholder="Bearer … or paste token"
              className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={addServer}
            className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            Add server
          </button>
        </div>
      ) : null}

      {jsonMode ? (
        <textarea
          value={mcpJson}
          onChange={(e) => setMcpJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 font-mono text-[0.65rem] leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none"
        />
      ) : (
        <ul className="space-y-2">
          {drafts.length === 0 ? (
            <p className="text-[0.7rem] text-[var(--text-faint)]">
              No MCP servers yet. Add a remote URL, or paste OpenAI-style{" "}
              <code className="text-[0.6rem]">mcpServers</code> JSON in Advanced.
            </p>
          ) : null}
          {drafts.map((d) => {
            const probe = probes.find((p) => p.serverId === d.id);
            return (
              <li
                key={d.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {d.name || d.id}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[0.6rem] text-[var(--text-faint)]">
                      {d.url || "—"}
                    </p>
                    {probe ? (
                      <p
                        className={`mt-1 text-[0.65rem] ${
                          probe.ok ? "text-emerald-200/90" : "text-red-300/90"
                        }`}
                      >
                        {probe.ok
                          ? `${probe.tools?.length ?? 0} tools discovered`
                          : probe.error || "Failed"}
                      </p>
                    ) : null}
                    {probe?.ok && probe.tools && probe.tools.length > 0 ? (
                      <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto">
                        {probe.tools.slice(0, 12).map((t) => (
                          <li
                            key={t.name}
                            className="truncate text-[0.6rem] text-[var(--text-muted)]"
                          >
                            {t.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => toggleEnabled(d.id)}
                      className={`relative h-5 w-9 rounded-full transition ${
                        d.enabled ? "bg-[var(--accent)]" : "bg-white/15"
                      }`}
                      aria-label={d.enabled ? "Disable server" : "Enable server"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                          d.enabled ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeServer(d.id)}
                      className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] text-[var(--text-muted)] hover:bg-white/[0.12]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block text-[0.6rem] text-[var(--text-faint)]">
                    URL
                    <input
                      value={d.url}
                      onChange={(e) => {
                        const next = drafts.map((x) =>
                          x.id === d.id ? { ...x, url: e.target.value } : x,
                        );
                        setDrafts(next);
                        syncJsonFromDrafts(next);
                      }}
                      className="mt-0.5 w-full rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1.5 text-[0.7rem] text-[var(--text-primary)]"
                    />
                  </label>
                  <label className="block text-[0.6rem] text-[var(--text-faint)]">
                    Auth
                    <input
                      value={d.authHeader}
                      onChange={(e) => {
                        const next = drafts.map((x) =>
                          x.id === d.id ? { ...x, authHeader: e.target.value } : x,
                        );
                        setDrafts(next);
                        syncJsonFromDrafts(next);
                      }}
                      placeholder="Bearer token"
                      className="mt-0.5 w-full rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1.5 text-[0.7rem] text-[var(--text-primary)]"
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {msg ? <p className="text-[0.7rem] text-[var(--text-faint)]">{msg}</p> : null}
    </div>
  );
}
