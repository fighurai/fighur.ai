/* global chrome */
(() => {
  const UPGRADE_URL = "https://fighur.ai/upgrade";
  const SIGN_IN_URL = "https://fighur.ai/sign-in";
  const HOME_URL = "https://fighur.ai/extension";
  const CACHE_MAX_MS = 1000 * 60 * 60 * 24;

  const DEFAULT_THEME = {
    enabled: false,
    bg: "#EEFF00",
    fg: "#1432F5",
  };

  const $ = (id) => document.getElementById(id);
  const gate = $("gate");
  const controls = $("controls");
  const statusEl = $("status");
  const enabledEl = $("enabled");
  const bgEl = $("background");
  const textEl = $("text");
  const applyBtn = $("apply");
  const resetBtn = $("reset");

  function setStatus(text, tone = "muted") {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  }

  function normalizeTheme(raw) {
    const t = raw || {};
    return {
      enabled: Boolean(t.enabled),
      bg: t.bg || t.background || DEFAULT_THEME.bg,
      fg: t.fg || t.text || DEFAULT_THEME.fg,
    };
  }

  function isPro(entitlement) {
    if (!entitlement || typeof entitlement.at !== "number") return false;
    if (Date.now() - entitlement.at > CACHE_MAX_MS) return false;
    return Boolean(entitlement.signedIn && entitlement.pro);
  }

  function showGate({ signedIn, needsVisit }) {
    controls.hidden = true;
    gate.hidden = false;
    if (needsVisit) {
      gate.innerHTML = `
        <p class="lead">Open FIGHURAI once so Pro can sync to this extension.</p>
        <a class="btn primary" href="${HOME_URL}" target="_blank" rel="noreferrer">Open FIGHURAI</a>
        <p class="hint">Stay signed in on Pro, then reopen this popup.</p>
      `;
      return;
    }
    if (!signedIn) {
      gate.innerHTML = `
        <p class="lead">Sign in to FIGHURAI to unlock Colors.</p>
        <a class="btn primary" href="${SIGN_IN_URL}" target="_blank" rel="noreferrer">Sign in</a>
        <p class="hint">Colors is included with Pro.</p>
      `;
      return;
    }
    gate.innerHTML = `
      <p class="lead">Colors is a <strong>Pro</strong> feature.</p>
      <a class="btn primary" href="${UPGRADE_URL}" target="_blank" rel="noreferrer">Upgrade to Pro</a>
    `;
  }

  function showControls() {
    gate.hidden = true;
    controls.hidden = false;
  }

  function fillForm(theme) {
    const t = normalizeTheme(theme);
    enabledEl.checked = t.enabled;
    bgEl.value = t.bg;
    textEl.value = t.fg;
    bgEl.disabled = !t.enabled;
    textEl.disabled = !t.enabled;
  }

  function readForm() {
    return {
      enabled: enabledEl.checked,
      bg: bgEl.value,
      fg: textEl.value,
    };
  }

  async function getState() {
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

  async function saveTheme(theme) {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fighur-save-theme", theme }, () => resolve());
    });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "fighur-page-theme-apply",
          theme,
        });
      } catch {
        /* restricted pages */
      }
    }
  }

  enabledEl.addEventListener("change", () => {
    bgEl.disabled = !enabledEl.checked;
    textEl.disabled = !enabledEl.checked;
    void saveTheme(readForm());
  });
  bgEl.addEventListener("input", () => void saveTheme(readForm()));
  textEl.addEventListener("input", () => void saveTheme(readForm()));
  applyBtn.addEventListener("click", () => {
    void saveTheme({ ...readForm(), enabled: true }).then(() => {
      enabledEl.checked = true;
      bgEl.disabled = false;
      textEl.disabled = false;
      setStatus("Applied on this page.", "ok");
    });
  });
  resetBtn.addEventListener("click", () => {
    fillForm(DEFAULT_THEME);
    void saveTheme(DEFAULT_THEME).then(() => setStatus("Custom colors off.", "muted"));
  });

  async function init() {
    const state = await getState();
    if (!state.entitlement) {
      showGate({ signedIn: false, needsVisit: true });
      setStatus("Open FIGHURAI to sync Pro", "warn");
      return;
    }
    if (!isPro(state.entitlement)) {
      showGate({
        signedIn: Boolean(state.entitlement.signedIn),
        needsVisit: false,
      });
      setStatus(state.entitlement.signedIn ? "Pro required" : "Sign in required", "warn");
      return;
    }
    showControls();
    fillForm(state.theme);
    setStatus(`Pro · ${state.entitlement.email || "signed in"}`, "ok");
  }

  void init();
})();
