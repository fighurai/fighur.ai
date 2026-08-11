(() => {
  if (window.__fighurColorsBooted) return;
  window.__fighurColorsBooted = true;

  const STYLE_ID = "fighur-page-theme-style";
  const ROOT_ID = "fighur-colors-root";
  const ATTR = "data-fighur-page-theme";
  const UPGRADE_URL = "https://fighur.ai/upgrade";
  const SIGN_IN_URL = "https://fighur.ai/sign-in";
  const HOME_URL = "https://fighur.ai/";
  const CACHE_MAX_MS = 1000 * 60 * 60 * 24;

  const DEFAULT_THEME = {
    enabled: false,
    bg: "#EEFF00",
    fg: "#1432F5",
  };

  let panelOpen = false;
  let latestTheme = { ...DEFAULT_THEME };

  function ensureStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.documentElement || document.head || document).appendChild(el);
    }
    return el;
  }

  function clearTheme() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement?.removeAttribute(ATTR);
  }

  function applyTheme(theme) {
    const raw = theme || {};
    latestTheme = {
      enabled: Boolean(raw.enabled),
      bg: raw.bg || raw.background || DEFAULT_THEME.bg,
      fg: raw.fg || raw.text || DEFAULT_THEME.fg,
    };
    if (!latestTheme.enabled) {
      clearTheme();
      return;
    }
    const bg = latestTheme.bg || DEFAULT_THEME.bg;
    const fg = latestTheme.fg || DEFAULT_THEME.fg;
    const el = ensureStyle();
    document.documentElement?.setAttribute(ATTR, "on");
    el.textContent = `
html[${ATTR}], html[${ATTR}] body {
  background-color: ${bg} !important;
  color: ${fg} !important;
  background-image: none !important;
}
html[${ATTR}] p, html[${ATTR}] li, html[${ATTR}] span, html[${ATTR}] h1,
html[${ATTR}] h2, html[${ATTR}] h3, html[${ATTR}] h4, html[${ATTR}] h5, html[${ATTR}] h6,
html[${ATTR}] label, html[${ATTR}] td, html[${ATTR}] th, html[${ATTR}] a,
html[${ATTR}] button, html[${ATTR}] input, html[${ATTR}] textarea, html[${ATTR}] select,
html[${ATTR}] div, html[${ATTR}] section, html[${ATTR}] article, html[${ATTR}] nav,
html[${ATTR}] header, html[${ATTR}] footer, html[${ATTR}] main, html[${ATTR}] aside {
  color: ${fg} !important;
}
html[${ATTR}] a {
  text-decoration-color: ${fg} !important;
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
        <p class="fighur-lead">Open FIGHURAI once in this Chrome profile so Pro can sync.</p>
        <a class="fighur-btn fighur-btn-primary" href="${HOME_URL}" target="_blank" rel="noreferrer">Open FIGHURAI</a>
        <p class="fighur-hint">Stay signed in, then click the extension again.</p>
      `;
    } else if (!signedIn) {
      body = `
        <p class="fighur-lead">Sign in to FIGHURAI, then open Colors again.</p>
        <a class="fighur-btn fighur-btn-primary" href="${SIGN_IN_URL}" target="_blank" rel="noreferrer">Sign in</a>
        <p class="fighur-hint">Page Theme / Colors is included with Pro.</p>
      `;
    } else {
      body = `
        <p class="fighur-lead">Colors on any website is a <strong>Pro</strong> feature.</p>
        <p class="fighur-hint">Same background and text controls as on FIGHURAI.</p>
        <a class="fighur-btn fighur-btn-primary" href="${UPGRADE_URL}" target="_blank" rel="noreferrer">Upgrade to Pro</a>
      `;
    }
    root.innerHTML = `
      <button type="button" class="fighur-backdrop" aria-label="Close colors" data-fighur-close></button>
      <div class="fighur-panel" role="dialog" aria-label="Colors">
        <div class="fighur-panel-head">
          <div class="fighur-brand">
            <span class="fighur-mark" aria-hidden="true"></span>
            <div>
              <p class="fighur-title">Colors</p>
              <p class="fighur-sub">FIGHURAI Pro</p>
            </div>
          </div>
          <button type="button" class="fighur-x" data-fighur-close aria-label="Close">×</button>
        </div>
        <div class="fighur-panel-body">${body}</div>
      </div>
    `;
  }

  function renderControls(root, theme) {
    const t = { ...DEFAULT_THEME, ...theme };
    root.innerHTML = `
      <button type="button" class="fighur-backdrop" aria-label="Close colors" data-fighur-close></button>
      <div class="fighur-panel" role="dialog" aria-label="Colors">
        <div class="fighur-panel-head">
          <div class="fighur-brand">
            <span class="fighur-mark" aria-hidden="true"></span>
            <div>
              <p class="fighur-title">Colors</p>
              <p class="fighur-sub">Same as FIGHURAI</p>
            </div>
          </div>
          <button type="button" class="fighur-x" data-fighur-close aria-label="Close">×</button>
        </div>
        <div class="fighur-panel-body">
          <p class="fighur-lead">Page colors</p>
          <p class="fighur-hint">Pick background and text. Uses your OS color picker (often a wheel on mobile).</p>
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
          <button type="button" class="fighur-btn fighur-btn-ghost" id="fighur-off">Turn off custom colors</button>
        </div>
      </div>
    `;

    const enabledEl = root.querySelector("#fighur-enabled");
    const bgEl = root.querySelector("#fighur-bg");
    const fgEl = root.querySelector("#fighur-fg");
    const offBtn = root.querySelector("#fighur-off");

    const persistFromForm = () => {
      const next = {
        enabled: Boolean(enabledEl.checked),
        bg: bgEl.value,
        fg: fgEl.value,
      };
      bgEl.disabled = !next.enabled;
      fgEl.disabled = !next.enabled;
      void saveTheme(next);
    };

    enabledEl.addEventListener("change", persistFromForm);
    bgEl.addEventListener("input", persistFromForm);
    fgEl.addEventListener("input", persistFromForm);
    offBtn.addEventListener("click", () => {
      enabledEl.checked = false;
      bgEl.value = DEFAULT_THEME.bg;
      fgEl.value = DEFAULT_THEME.fg;
      persistFromForm();
    });
  }

  async function openPanel() {
    closePanel();
    const host = document.createElement("div");
    host.id = ROOT_ID;
    document.documentElement.appendChild(host);

    const state = await getState();
    if (!isPro(state.entitlement)) {
      renderGate(host, state.entitlement);
    } else {
      renderControls(host, state.theme);
    }

    host.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.closest && t.closest("[data-fighur-close]")) {
        closePanel();
      }
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

  chrome.storage.sync.get(["fighurPageTheme"], (data) => {
    applyTheme(data?.fighurPageTheme || DEFAULT_THEME);
  });

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
      return false;
    }
    return false;
  });
})();
