"use client";

import { useEffect, useState } from "react";

import { applyThemeVars, mixHex, readTheme } from "@/lib/theme-storage";

/**
 * Ombré wash for the landing experience — cycles vivid backgrounds
 * (matching the Colors look) one into the next while custom Colors are off.
 */
const PALETTE = [
  "#EEFF00", // electric yellow
  "#FF5A1F", // vivid orange
  "#FF1A8C", // hot magenta
  "#1432F5", // royal blue
  "#00E5A8", // mint teal
  "#A855F7", // violet
  "#FF3B30", // coral red
  "#0EA5E9", // sky
  "#FACC15", // gold
  "#EC4899", // pink
  "#22C55E", // green
  "#6366F1", // indigo
] as const;

const HOLD_MS = 900;
const BLEND_MS = 1400;

type AmbientOmbreBackgroundProps = {
  /** When false, restore defaults and stop cycling. */
  active: boolean;
};

export function AmbientOmbreBackground({ active }: AmbientOmbreBackgroundProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!active) {
      const prefs = readTheme();
      if (!prefs.enabled) {
        applyThemeVars({ enabled: false, bg: prefs.bg, fg: prefs.fg });
      }
      document.documentElement.dataset.ombre = "off";
      return;
    }

    if (reduceMotion) {
      const prefs = readTheme();
      if (!prefs.enabled) {
        applySoftBg(PALETTE[0]);
        document.documentElement.dataset.ombre = "on";
      }
      return () => {
        document.documentElement.dataset.ombre = "off";
        const p = readTheme();
        if (!p.enabled) {
          applyThemeVars({ enabled: false, bg: p.bg, fg: p.fg });
        }
      };
    }

    document.documentElement.dataset.ombre = "on";

    let cancelled = false;
    let frame = 0;
    let fromIdx = 0;
    let phaseStart = performance.now();
    let blending = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const prefs = readTheme();
      if (prefs.enabled) {
        document.documentElement.dataset.ombre = "off";
        frame = requestAnimationFrame(tick);
        return;
      }

      document.documentElement.dataset.ombre = "on";
      const elapsed = now - phaseStart;
      const from = PALETTE[fromIdx];
      const to = PALETTE[(fromIdx + 1) % PALETTE.length];

      if (!blending) {
        applySoftBg(from);
        if (elapsed >= HOLD_MS) {
          blending = true;
          phaseStart = now;
        }
      } else {
        const t = Math.min(1, elapsed / BLEND_MS);
        const eased = t * t * (3 - 2 * t);
        applySoftBg(mixHex(from, to, eased));
        if (t >= 1) {
          blending = false;
          fromIdx = (fromIdx + 1) % PALETTE.length;
          phaseStart = now;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      document.documentElement.dataset.ombre = "off";
      const prefs = readTheme();
      if (!prefs.enabled) {
        applyThemeVars({ enabled: false, bg: prefs.bg, fg: prefs.fg });
      }
    };
  }, [active, reduceMotion]);

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
      data-ombre-layer=""
    />
  );
}

function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function applySoftBg(bg: string) {
  // Light washes (yellow/gold) get dark blue text; saturated dark/mid hues get light text.
  const lightBg = relativeLuminance(bg) > 0.45;
  const fg = lightBg ? "#1432F5" : "#f4f4f5";
  const root = document.documentElement;
  root.style.setProperty("--bg-deep", bg);
  root.style.setProperty("--bg-elevated", mixHex(bg, fg, lightBg ? 0.08 : 0.12));
  root.style.setProperty("--card", `color-mix(in srgb, ${fg} 8%, ${bg})`);
  root.style.setProperty("--text-primary", fg);
  root.style.setProperty("--text-muted", mixHex(fg, bg, lightBg ? 0.28 : 0.36));
  root.style.setProperty("--text-faint", mixHex(fg, bg, lightBg ? 0.42 : 0.52));
}
