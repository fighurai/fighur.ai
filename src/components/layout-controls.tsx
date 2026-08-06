"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  defaultLayoutPrefs,
  LAYOUT_CHANGE_EVENT,
  persistLayout,
  readLayout,
  type LayoutPrefs,
  type LayoutSide,
} from "@/lib/layout-storage";
import { syncLayoutToServer } from "@/lib/layout-sync";

export function LayoutControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<LayoutPrefs>(() => defaultLayoutPrefs());

  useEffect(() => {
    const p = readLayout();
    const id = requestAnimationFrame(() => setPrefs(p));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onLayout = (e: Event) => {
      const detail = (e as CustomEvent<LayoutPrefs>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener(LAYOUT_CHANGE_EVENT, onLayout);
    return () => window.removeEventListener(LAYOUT_CHANGE_EVENT, onLayout);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const persist = useCallback((next: LayoutPrefs) => {
    const saved = persistLayout(next);
    setPrefs(saved);
    syncLayoutToServer(saved, 0);
  }, []);

  const setSide = (key: "sidebarSide" | "canvasSide", side: LayoutSide) => {
    persist({ ...prefs, [key]: side });
  };

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Layout
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <p className="text-xs font-medium text-[var(--text-primary)]">Workspace layout</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            Desktop only. Starts as today’s layout — change panels here or drag the Canvas edge.
          </p>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={prefs.sidebarVisible}
              onChange={(e) => persist({ ...prefs, sidebarVisible: e.target.checked })}
              className="rounded border-white/20"
            />
            Show chat sidebar
          </label>

          <div className="mt-3 grid gap-2">
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>Sidebar side</span>
              <select
                value={prefs.sidebarSide}
                onChange={(e) => setSide("sidebarSide", e.target.value as LayoutSide)}
                className="rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1 text-[0.7rem] text-[var(--text-primary)]"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>Canvas side</span>
              <select
                value={prefs.canvasSide}
                onChange={(e) => setSide("canvasSide", e.target.value as LayoutSide)}
                className="rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1 text-[0.7rem] text-[var(--text-primary)]"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={prefs.rememberCanvasOpen}
              onChange={(e) =>
                persist({
                  ...prefs,
                  rememberCanvasOpen: e.target.checked,
                  canvasOpenPreferred: e.target.checked ? prefs.canvasOpenPreferred : false,
                })
              }
              className="rounded border-white/20"
            />
            Remember Canvas open/closed
          </label>

          <button
            type="button"
            onClick={() => persist(defaultLayoutPrefs())}
            className="mt-3 w-full rounded-full bg-white/[0.08] px-3 py-1.5 text-[0.7rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12]"
          >
            Reset to default layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
