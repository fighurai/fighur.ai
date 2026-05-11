"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  applyThemeVars,
  readTheme,
  writeTheme,
  type ThemePrefs,
} from "@/lib/theme-storage";

export function ThemeControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<ThemePrefs>({
    enabled: false,
    bg: "#08090d",
    fg: "#f4f4f5",
  });

  useEffect(() => {
    const p = readTheme();
    const id = requestAnimationFrame(() => {
      setPrefs(p);
      applyThemeVars(p);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const persist = useCallback((next: ThemePrefs) => {
    setPrefs(next);
    writeTheme(next);
    applyThemeVars(next);
  }, []);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Colors
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <p className="text-xs font-medium text-[var(--text-primary)]">Page colors</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            Pick background and text. Uses your OS color picker (often a wheel on mobile).
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => persist({ ...prefs, enabled: e.target.checked })}
              className="rounded border-white/20"
            />
            Use custom colors
          </label>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <span>Background</span>
              <input
                type="color"
                value={prefs.bg}
                disabled={!prefs.enabled}
                onChange={(e) => persist({ ...prefs, bg: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-white/[0.12] bg-transparent disabled:opacity-40"
                title="Background color"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <span>Text</span>
              <input
                type="color"
                value={prefs.fg}
                disabled={!prefs.enabled}
                onChange={(e) => persist({ ...prefs, fg: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-white/[0.12] bg-transparent disabled:opacity-40"
                title="Text color"
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-full border border-white/[0.1] py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            onClick={() => {
              persist({
                enabled: false,
                bg: "#08090d",
                fg: "#f4f4f5",
              });
            }}
          >
            Reset to default
          </button>
        </div>
      ) : null}
    </div>
  );
}
