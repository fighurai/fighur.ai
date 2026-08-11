(() => {
  const CACHE_KEY = "fighurEntitlement";
  const THEME_KEY = "fighurPageTheme";
  const SITE_THEME_KEY = "smile-ai-theme";

  const DEFAULT_THEME = {
    enabled: false,
    bg: "#EEFF00",
    fg: "#1432F5",
  };

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

  function readSiteTheme() {
    try {
      const raw = localStorage.getItem(SITE_THEME_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return {
        enabled: Boolean(v.enabled),
        bg: typeof v.bg === "string" ? v.bg : DEFAULT_THEME.bg,
        fg: typeof v.fg === "string" ? v.fg : DEFAULT_THEME.fg,
      };
    } catch {
      return null;
    }
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

  function writeSiteTheme(theme) {
    try {
      const next = {
        enabled: Boolean(theme.enabled),
        bg: theme.bg || DEFAULT_THEME.bg,
        fg: theme.fg || DEFAULT_THEME.fg,
      };
      localStorage.setItem(SITE_THEME_KEY, JSON.stringify(next));
      applySiteVars(next);
      window.dispatchEvent(new CustomEvent("smile-theme-changed", { detail: next }));
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
        email: typeof data.email === "string" ? data.email : null,
        plan: typeof data.plan === "string" ? data.plan : null,
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

  async function syncThemeFromSite() {
    const site = readSiteTheme();
    if (!site) return;
    await chrome.storage.sync.set({ [THEME_KEY]: site });
  }

  void syncEntitlement();
  void syncThemeFromSite();
  window.setInterval(() => void syncEntitlement(), 60_000);

  window.addEventListener("smile-theme-changed", (e) => {
    const detail = e?.detail;
    if (!detail) return;
    void chrome.storage.sync.set({
      [THEME_KEY]: {
        enabled: Boolean(detail.enabled),
        bg: detail.bg || DEFAULT_THEME.bg,
        fg: detail.fg || DEFAULT_THEME.fg,
      },
    });
  });

  window.addEventListener("storage", (e) => {
    if (e.key === SITE_THEME_KEY) void syncThemeFromSite();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.fighurPageTheme) {
      const next = changes.fighurPageTheme.newValue;
      if (!next) return;
      const site = readSiteTheme();
      if (
        site &&
        site.enabled === next.enabled &&
        site.bg === next.bg &&
        site.fg === next.fg
      ) {
        return;
      }
      writeSiteTheme(next);
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "fighur-sync-entitlement") {
      void syncEntitlement().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
})();
