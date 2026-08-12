(() => {
  const CACHE_KEY = "fighurEntitlement";
  const THEME_KEY = "fighurPageTheme";
  const SITE_THEME_KEY = "smile-ai-theme";

  const DEFAULT_THEME = {
    enabled: false,
    bg: "#EEFF00",
    fg: "#1432F5",
  };

  /** Avoid echoing storage ↔ site in a loop. */
  let applyingFromExtension = false;

  function parse(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function hx(n) {
    return n.toString(16).padStart(2, "0");
  }

  function mixHex(a, b, t) {
    const pa = parse(a);
    const pb = parse(b);
    if (!pa || !pb) return a;
    return `#${hx(Math.round(pa.r + (pb.r - pa.r) * t))}${hx(
      Math.round(pa.g + (pb.g - pa.g) * t),
    )}${hx(Math.round(pa.b + (pb.b - pa.b) * t))}`;
  }

  function normalizeTheme(raw) {
    const t = raw || {};
    return {
      enabled: Boolean(t.enabled),
      bg: typeof t.bg === "string" ? t.bg : t.background || DEFAULT_THEME.bg,
      fg: typeof t.fg === "string" ? t.fg : t.text || DEFAULT_THEME.fg,
    };
  }

  function readSiteTheme() {
    try {
      const raw = localStorage.getItem(SITE_THEME_KEY);
      if (!raw) return null;
      return normalizeTheme(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function themesEqual(a, b) {
    if (!a || !b) return false;
    return a.enabled === b.enabled && a.bg === b.bg && a.fg === b.fg;
  }

  function applySiteVars(theme) {
    const root = document.documentElement;
    if (!theme?.enabled) {
      root.style.removeProperty("--bg-deep");
      root.style.removeProperty("--bg-elevated");
      root.style.removeProperty("--text-primary");
      root.style.removeProperty("--text-muted");
      root.style.removeProperty("--text-faint");
      root.style.removeProperty("--card");
      return;
    }
    const bg = theme.bg;
    const fg = theme.fg;
    root.style.setProperty("--bg-deep", bg);
    root.style.setProperty("--bg-elevated", mixHex(bg, fg, 0.08));
    root.style.setProperty("--card", `color-mix(in srgb, ${fg} 6%, ${bg})`);
    root.style.setProperty("--text-primary", fg);
    root.style.setProperty("--text-muted", mixHex(fg, bg, 0.38));
    root.style.setProperty("--text-faint", mixHex(fg, bg, 0.55));
  }

  function writeSiteTheme(theme, { emitEvent = true } = {}) {
    try {
      const next = normalizeTheme(theme);
      localStorage.setItem(SITE_THEME_KEY, JSON.stringify(next));
      applySiteVars(next);
      if (emitEvent) {
        window.dispatchEvent(new CustomEvent("smile-theme-changed", { detail: next }));
      }
    } catch {
      /* ignore */
    }
  }

  async function syncEntitlement() {
    try {
      const res = await fetch("/api/extension/entitlement", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) || {};
      const payload = {
        at: Date.now(),
        signedIn: Boolean(data.signedIn) && res.status !== 401,
        pro: Boolean(data.pro || data.features?.pageTheme),
      };
      if (res.status === 401) {
        payload.signedIn = false;
        payload.pro = false;
      }
      await chrome.storage.local.set({ [CACHE_KEY]: payload });
    } catch {
      /* ignore */
    }
  }

  /**
   * Extension storage is the cross-site source of truth.
   * Never push site localStorage → sync on load (that used to wipe enabled
   * themes whenever fighur.ai had enabled:false).
   */
  async function pullThemeFromExtension() {
    try {
      const data = await chrome.storage.sync.get([THEME_KEY]);
      const theme = normalizeTheme(data?.[THEME_KEY] || DEFAULT_THEME);
      const site = readSiteTheme();
      if (themesEqual(site, theme)) {
        applySiteVars(theme);
        return;
      }
      applyingFromExtension = true;
      writeSiteTheme(theme, { emitEvent: true });
      applyingFromExtension = false;
    } catch {
      applyingFromExtension = false;
    }
  }

  void syncEntitlement();
  void pullThemeFromExtension();
  window.setInterval(() => void syncEntitlement(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncEntitlement();
      void pullThemeFromExtension();
    }
  });

  // User changed Colors on the website → update extension (other tabs/sites).
  window.addEventListener("smile-theme-changed", (e) => {
    if (applyingFromExtension) return;
    const detail = e?.detail;
    if (!detail) return;
    const next = normalizeTheme(detail);
    void chrome.storage.sync.set({ [THEME_KEY]: next });
  });

  window.addEventListener("storage", (e) => {
    if (e.key !== SITE_THEME_KEY) return;
    // Another fighur.ai tab wrote theme — mirror to extension, don't clobber if null.
    if (!e.newValue) return;
    try {
      const next = normalizeTheme(JSON.parse(e.newValue));
      applySiteVars(next);
      void chrome.storage.sync.set({ [THEME_KEY]: next });
    } catch {
      /* ignore */
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.fighurPageTheme) return;
    const next = normalizeTheme(changes.fighurPageTheme.newValue || DEFAULT_THEME);
    const site = readSiteTheme();
    if (themesEqual(site, next)) {
      applySiteVars(next);
      return;
    }
    applyingFromExtension = true;
    writeSiteTheme(next, { emitEvent: true });
    applyingFromExtension = false;
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "fighur-sync-entitlement") {
      void syncEntitlement().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === "fighur-page-theme-apply") {
      applyingFromExtension = true;
      writeSiteTheme(msg.theme || DEFAULT_THEME, { emitEvent: true });
      applyingFromExtension = false;
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
