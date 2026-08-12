(() => {
  if (window.__fighurColorsBooted) return;
  window.__fighurColorsBooted = true;

  const STYLE_ID = "fighur-page-theme-style";
  const FAB_ID = "fighur-colors-fab";
  const ROOT_ID = "fighur-colors-root";
  const ATTR = "data-fighur-page-theme";
  const UPGRADE_URL = "https://fighur.ai/upgrade";
  const HOME_URL = "https://fighur.ai/extension";
  const CACHE_MAX_MS = 1000 * 60 * 60 * 24;

  const DEFAULT_THEME = {
    enabled: false,
    bg: "#EEFF00",
    fg: "#1432F5",
  };

  let panelOpen = false;
  let lastTheme = DEFAULT_THEME;

  function isFigHurHost() {
    const h = location.hostname;
    return (
      h === "fighur.ai" ||
      h === "www.fighur.ai" ||
      h === "fighurai.ai" ||
      h === "www.fighurai.ai" ||
      h === "localhost" ||
      h === "127.0.0.1"
    );
  }

  function normalizeTheme(raw) {
    const t = raw || {};
    return {
      enabled: Boolean(t.enabled),
      bg: t.bg || t.background || DEFAULT_THEME.bg,
      fg: t.fg || t.text || DEFAULT_THEME.fg,
    };
  }

  function ensureStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      const parent = document.head || document.documentElement;
      parent.appendChild(el);
    }
    return el;
  }

  function clearTheme() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement?.removeAttribute(ATTR);
  }

  function applyTheme(theme) {
    const t = normalizeTheme(theme);
    lastTheme = t;

    // fighur.ai uses CSS variables via site-bridge — don't fight with !important.
    if (isFigHurHost()) {
      clearTheme();
      return;
    }

    if (!t.enabled) {
      clearTheme();
      return;
    }

    const el = ensureStyle();
    document.documentElement?.setAttribute(ATTR, "on");
    el.textContent = `
html[${ATTR}] {
  background-color: ${t.bg} !important;
  background-image: none !important;
  color: ${t.fg} !important;
}
html[${ATTR}] body {
  background-color: ${t.bg} !important;
  background-image: none !important;
  color: ${t.fg} !important;
}
html[${ATTR}] #__next,
html[${ATTR}] #root,
html[${ATTR}] #app,
html[${ATTR}] #__nuxt,
html[${ATTR}] main,
html[${ATTR}] [data-reactroot] {
  background-color: ${t.bg} !important;
  background-image: none !important;
  color: ${t.fg} !important;
}
html[${ATTR}] p, html[${ATTR}] li, html[${ATTR}] span, html[${ATTR}] h1,
html[${ATTR}] h2, html[${ATTR}] h3, html[${ATTR}] h4, html[${ATTR}] h5, html[${ATTR}] h6,
html[${ATTR}] label, html[${ATTR}] td, html[${ATTR}] th, html[${ATTR}] a,
html[${ATTR}] button, html[${ATTR}] input, html[${ATTR}] textarea, html[${ATTR}] select,
html[${ATTR}] div, html[${ATTR}] section, html[${ATTR}] article, html[${ATTR}] nav,
html[${ATTR}] header, html[${ATTR}] footer, html[${ATTR}] main, html[${ATTR}] aside {
  color: ${t.fg} !important;
}
`;
  }

  function isPro(entitlement) {
    if (!entitlement || typeof entitlement.at !== "number") return false;
    if (Date.now() - entitlement.at > CACHE_MAX_MS) return false;
    return Boolean(entitlement.signedIn && entitlement.pro);
  }

  function getState() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fighur-get-state" }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ theme: DEFAULT_THEME, entitlement: null });
          return;
        }
        resolve(res || { theme: DEFAULT_THEME, entitlement: null });
      });
    });
  }

  function saveTheme(theme) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fighur-save-theme", theme }, () => {
        applyTheme(theme);
        resolve();
      });
    });
  }

  function ensureFab() {
    if (document.getElementById(FAB_ID)) return;
    const btn = document.createElement("button");
    btn.id = FAB_ID;
    btn.type = "button";
    btn.title = "FIGHURAI Colors";
    btn.setAttribute("aria-label", "Open FIGHURAI Colors");
    btn.innerHTML = `<span class="fighur-fab-dot"></span><span class="fighur-fab-label">Colors</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void togglePanel();
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  function closePanel() {
    document.getElementById(ROOT_ID)?.remove();
    panelOpen = false;
  }

  function renderGate(root, entitlement) {
    const needsVisit = !entitlement;
    const signedIn = Boolean(entitlement?.signedIn);
    let body = "";
    if (needsVisit) {
      body = `
        <p class="fighur-lead">Open FIGHURAI once so Pro can sync.</p>
        <a class="fighur-btn fighur-btn-primary" href="${HOME_URL}" target="_blank" rel="noreferrer">Open FIGHURAI</a>
      `;
    } else if (!signedIn) {
      body = `
        <p class="fighur-lead">Sign in on FIGHURAI to use Colors.</p>
        <a class="fighur-btn fighur-btn-primary" href="https://fighur.ai/sign-in" target="_blank" rel="noreferrer">Sign in</a>
      `;
    } else {
      body = `
        <p class="fighur-lead">Colors on any site is included with <strong>Pro</strong>.</p>
        <a class="fighur-btn fighur-btn-primary" href="${UPGRADE_URL}" target="_blank" rel="noreferrer">Upgrade to Pro</a>
      `;
    }
    root.innerHTML = `
      <button type="button" class="fighur-backdrop" data-fighur-close aria-label="Close"></button>
      <div class="fighur-panel" role="dialog" aria-label="Colors">
        <div class="fighur-panel-head">
          <div class="fighur-brand">
            <span class="fighur-mark"></span>
            <div>
              <p class="fighur-title">Colors</p>
              <p class="fighur-sub">FIGHURAI</p>
            </div>
          </div>
          <button type="button" class="fighur-x" data-fighur-close aria-label="Close">×</button>
        </div>
        <div class="fighur-panel-body">${body}</div>
      </div>
    `;
  }

  function renderControls(root, theme) {
    const t = normalizeTheme(theme);
    root.innerHTML = `
      <button type="button" class="fighur-backdrop" data-fighur-close aria-label="Close"></button>
      <div class="fighur-panel" role="dialog" aria-label="Colors">
        <div class="fighur-panel-head">
          <div class="fighur-brand">
            <span class="fighur-mark"></span>
            <div>
              <p class="fighur-title">Colors</p>
              <p class="fighur-sub">Same as FIGHURAI</p>
            </div>
          </div>
          <button type="button" class="fighur-x" data-fighur-close aria-label="Close">×</button>
        </div>
        <div class="fighur-panel-body">
          <p class="fighur-lead">Page colors</p>
          <p class="fighur-hint">Pick background and text — the same controls as on FIGHURAI.</p>
          <label class="fighur-check">
            <input type="checkbox" id="fighur-enabled" ${t.enabled ? "checked" : ""} />
            <span>Use custom colors</span>
          </label>
          <label class="fighur-row">
            <span>Background</span>
            <input type="color" id="fighur-bg" value="${t.bg}" ${t.enabled ? "" : "disabled"} />
          </label>
          <label class="fighur-row">
            <span>Text</span>
            <input type="color" id="fighur-fg" value="${t.fg}" ${t.enabled ? "" : "disabled"} />
          </label>
          <button type="button" class="fighur-btn fighur-btn-primary" id="fighur-apply">Apply</button>
          <button type="button" class="fighur-btn fighur-btn-ghost" id="fighur-off">Turn off custom colors</button>
        </div>
      </div>
    `;

    const enabledEl = root.querySelector("#fighur-enabled");
    const bgEl = root.querySelector("#fighur-bg");
    const fgEl = root.querySelector("#fighur-fg");

    const persist = () => {
      const next = {
        enabled: Boolean(enabledEl.checked),
        bg: bgEl.value,
        fg: fgEl.value,
      };
      bgEl.disabled = !next.enabled;
      fgEl.disabled = !next.enabled;
      void saveTheme(next);
    };

    enabledEl.addEventListener("change", persist);
    bgEl.addEventListener("input", persist);
    fgEl.addEventListener("input", persist);
    root.querySelector("#fighur-apply").addEventListener("click", () => {
      enabledEl.checked = true;
      persist();
    });
    root.querySelector("#fighur-off").addEventListener("click", () => {
      enabledEl.checked = false;
      bgEl.value = DEFAULT_THEME.bg;
      fgEl.value = DEFAULT_THEME.fg;
      persist();
    });
  }

  async function openPanel() {
    closePanel();
    const host = document.createElement("div");
    host.id = ROOT_ID;
    (document.body || document.documentElement).appendChild(host);
    const state = await getState();
    if (!isPro(state.entitlement)) {
      renderGate(host, state.entitlement);
    } else {
      renderControls(host, state.theme);
    }
    host.addEventListener("click", (e) => {
      if (e.target?.closest?.("[data-fighur-close]")) closePanel();
    });
    panelOpen = true;
  }

  async function togglePanel() {
    if (panelOpen) {
      closePanel();
      return;
    }
    await openPanel();
  }

  function bootTheme() {
    chrome.storage.sync.get(["fighurPageTheme"], (data) => {
      applyTheme(data?.fighurPageTheme || DEFAULT_THEME);
    });
  }

  bootTheme();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.fighurPageTheme) {
      applyTheme(changes.fighurPageTheme.newValue);
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "fighur-colors-toggle") {
      void togglePanel().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === "fighur-page-theme-apply") {
      applyTheme(msg.theme);
      sendResponse({ ok: true });
    }
    return false;
  });

  // SPAs / aggressive sites sometimes strip injected <style> — put it back.
  const reassertTheme = () => {
    if (!lastTheme.enabled || isFigHurHost()) return;
    if (!document.getElementById(STYLE_ID) || document.documentElement?.getAttribute(ATTR) !== "on") {
      applyTheme(lastTheme);
    }
  };
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === ATTR) {
        reassertTheme();
        return;
      }
      if (m.type === "childList") {
        for (const n of m.removedNodes) {
          if (n && n.id === STYLE_ID) {
            reassertTheme();
            return;
          }
        }
      }
    }
  });
  mo.observe(document.documentElement, {
    childList: true,
    attributes: true,
    attributeFilter: [ATTR],
  });
  const watchHead = () => {
    if (document.head) mo.observe(document.head, { childList: true });
  };
  watchHead();
  if (!document.head) document.addEventListener("DOMContentLoaded", watchHead, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && lastTheme.enabled) applyTheme(lastTheme);
  });
  window.addEventListener("pageshow", () => {
    if (lastTheme.enabled) applyTheme(lastTheme);
  });

  if (document.body) ensureFab();
  else document.addEventListener("DOMContentLoaded", ensureFab, { once: true });
})();
