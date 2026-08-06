export type LayoutSide = "left" | "right";

export type LayoutPrefs = {
  sidebarVisible: boolean;
  sidebarSide: LayoutSide;
  /** Desktop sidebar width in px. Default 224 (= 14rem / w-56). */
  sidebarWidthPx: number;
  canvasSide: LayoutSide;
  /**
   * Custom canvas width in px. `null` keeps today’s `min(44rem, 46vw)`.
   */
  canvasWidthPx: number | null;
  /** When true, restore canvas open/closed from canvasOpenPreferred. */
  rememberCanvasOpen: boolean;
  canvasOpenPreferred: boolean;
};

const KEY = "fighur-layout-v1";

export const DEFAULT_SIDEBAR_WIDTH_PX = 224;
export const MIN_SIDEBAR_WIDTH_PX = 180;
export const MAX_SIDEBAR_WIDTH_PX = 320;
export const MIN_CANVAS_WIDTH_PX = 320;
export const MAX_CANVAS_WIDTH_PX = 720;

export function defaultLayoutPrefs(): LayoutPrefs {
  return {
    sidebarVisible: true,
    sidebarSide: "left",
    sidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
    canvasSide: "right",
    canvasWidthPx: null,
    rememberCanvasOpen: false,
    canvasOpenPreferred: false,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeLayoutPrefs(raw: Partial<LayoutPrefs> | null | undefined): LayoutPrefs {
  const d = defaultLayoutPrefs();
  if (!raw || typeof raw !== "object") return d;
  return {
    sidebarVisible: raw.sidebarVisible !== false,
    sidebarSide: raw.sidebarSide === "right" ? "right" : "left",
    sidebarWidthPx: clamp(
      typeof raw.sidebarWidthPx === "number" ? raw.sidebarWidthPx : d.sidebarWidthPx,
      MIN_SIDEBAR_WIDTH_PX,
      MAX_SIDEBAR_WIDTH_PX,
    ),
    canvasSide: raw.canvasSide === "left" ? "left" : "right",
    canvasWidthPx:
      typeof raw.canvasWidthPx === "number"
        ? clamp(raw.canvasWidthPx, MIN_CANVAS_WIDTH_PX, MAX_CANVAS_WIDTH_PX)
        : null,
    rememberCanvasOpen: Boolean(raw.rememberCanvasOpen),
    canvasOpenPreferred: Boolean(raw.canvasOpenPreferred),
  };
}

export function readLayout(): LayoutPrefs {
  if (typeof window === "undefined") return defaultLayoutPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultLayoutPrefs();
    return normalizeLayoutPrefs(JSON.parse(raw) as Partial<LayoutPrefs>);
  } catch {
    return defaultLayoutPrefs();
  }
}

export function writeLayout(p: LayoutPrefs) {
  localStorage.setItem(KEY, JSON.stringify(normalizeLayoutPrefs(p)));
}

export function applyLayoutCssVars(p: LayoutPrefs) {
  const root = document.documentElement;
  root.style.setProperty("--chat-sidebar-w", `${p.sidebarWidthPx}px`);
  if (p.canvasWidthPx == null) {
    root.style.setProperty("--canvas-w", "min(44rem, 46vw)");
  } else {
    root.style.setProperty("--canvas-w", `${p.canvasWidthPx}px`);
  }
}

/** Flex order for desktop columns. Sidebar stays outermost when both on same side. */
export function layoutColumnOrders(
  p: LayoutPrefs,
): { sidebar: number; main: number; canvas: number } {
  const s = p.sidebarSide;
  const c = p.canvasSide;
  if (s === "left" && c === "right") return { sidebar: 1, main: 2, canvas: 3 };
  if (s === "right" && c === "left") return { sidebar: 3, main: 2, canvas: 1 };
  if (s === "left" && c === "left") return { sidebar: 1, canvas: 2, main: 3 };
  return { main: 1, canvas: 2, sidebar: 3 };
}

export function composerDockInsets(
  p: LayoutPrefs,
  opts: { canvasOpen: boolean },
): { left: string; right: string } {
  const orders = layoutColumnOrders(p);
  const leftParts: string[] = [];
  const rightParts: string[] = [];
  if (p.sidebarVisible && orders.sidebar < orders.main) leftParts.push("var(--chat-sidebar-w)");
  if (opts.canvasOpen && orders.canvas < orders.main) leftParts.push("var(--canvas-w)");
  if (p.sidebarVisible && orders.sidebar > orders.main) rightParts.push("var(--chat-sidebar-w)");
  if (opts.canvasOpen && orders.canvas > orders.main) rightParts.push("var(--canvas-w)");
  return {
    left: leftParts.length ? `calc(${leftParts.join(" + ")})` : "0px",
    right: rightParts.length ? `calc(${rightParts.join(" + ")})` : "0px",
  };
}

export const LAYOUT_CHANGE_EVENT = "fighur-layout-change";

export function emitLayoutChange(p: LayoutPrefs) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LAYOUT_CHANGE_EVENT, { detail: p }));
}

export function persistLayout(p: LayoutPrefs) {
  const next = normalizeLayoutPrefs(p);
  writeLayout(next);
  applyLayoutCssVars(next);
  emitLayoutChange(next);
  return next;
}
