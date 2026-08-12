const THEME_KEY = "fighurPageTheme";
const ENTITLEMENT_KEY = "fighurEntitlement";

const DEFAULT_THEME = {
  enabled: false,
  bg: "#EEFF00",
  fg: "#1432F5",
};

function broadcastTheme(theme) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(
        tab.id,
        { type: "fighur-page-theme-apply", theme },
        () => {
          void chrome.runtime.lastError;
        },
      );
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get([THEME_KEY], (data) => {
    if (!data?.[THEME_KEY]) {
      void chrome.storage.sync.set({ [THEME_KEY]: DEFAULT_THEME });
    }
  });
  if (details.reason === "install") {
    void chrome.tabs.create({ url: "https://fighur.ai/extension?installed=1" });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "fighur-get-state") {
    chrome.storage.sync.get([THEME_KEY], (syncData) => {
      chrome.storage.local.get([ENTITLEMENT_KEY], (localData) => {
        sendResponse({
          theme: syncData?.[THEME_KEY] || DEFAULT_THEME,
          entitlement: localData?.[ENTITLEMENT_KEY] || null,
        });
      });
    });
    return true;
  }

  if (msg?.type === "fighur-save-theme") {
    const theme = msg.theme || DEFAULT_THEME;
    void chrome.storage.sync.set({ [THEME_KEY]: theme }).then(() => {
      broadcastTheme(theme);
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.fighurPageTheme) {
    broadcastTheme(changes.fighurPageTheme.newValue || DEFAULT_THEME);
  }
});
