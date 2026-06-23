export type ThemePrefs = {
  enabled: boolean;
  bg: string;
  fg: string;
};

/** Starting values in the Colors panel (custom theme only — site default stays dark). */
export const CUSTOM_COLOR_PRESET_BG = "#EEFF00";
export const CUSTOM_COLOR_PRESET_FG = "#1432F5";

const KEY = "smile-ai-theme";

const defaultPrefs: ThemePrefs = {
  enabled: false,
  bg: CUSTOM_COLOR_PRESET_BG,
  fg: CUSTOM_COLOR_PRESET_FG,
};

export function readTheme(): ThemePrefs {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultPrefs;
    const v = JSON.parse(raw) as Partial<ThemePrefs>;
    let bg = typeof v.bg === "string" ? v.bg : defaultPrefs.bg;
    let fg = typeof v.fg === "string" ? v.fg : defaultPrefs.fg;
    if (!v.enabled && bg.toLowerCase() === "#08090d" && fg.toLowerCase() === "#f4f4f5") {
      bg = CUSTOM_COLOR_PRESET_BG;
      fg = CUSTOM_COLOR_PRESET_FG;
    }
    return {
      enabled: Boolean(v.enabled),
      bg,
      fg,
    };
  } catch {
    return defaultPrefs;
  }
}

export function writeTheme(p: ThemePrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bch = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${hx(r)}${hx(g)}${hx(bch)}`;
}

function hx(n: number) {
  return n.toString(16).padStart(2, "0");
}

function parse(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function applyThemeVars(p: ThemePrefs) {
  const root = document.documentElement;
  if (!p.enabled) {
    root.style.removeProperty("--bg-deep");
    root.style.removeProperty("--bg-elevated");
    root.style.removeProperty("--text-primary");
    root.style.removeProperty("--text-muted");
    root.style.removeProperty("--text-faint");
    root.style.removeProperty("--card");
    return;
  }
  const bg = p.bg;
  const fg = p.fg;
  root.style.setProperty("--bg-deep", bg);
  root.style.setProperty("--bg-elevated", mixHex(bg, fg, 0.08));
  root.style.setProperty("--card", `color-mix(in srgb, ${fg} 6%, ${bg})`);
  root.style.setProperty("--text-primary", fg);
  root.style.setProperty("--text-muted", mixHex(fg, bg, 0.38));
  root.style.setProperty("--text-faint", mixHex(fg, bg, 0.55));
}
