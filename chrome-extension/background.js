const THEME_KEY = "fighurPageTheme";
const ENTITLEMENT_KEY = "fighurEntitlement";

const DEFAULT_THEME = {
  enabled: false,
  bg: "#EEFF00",
  fg: "#1432F5",
};

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
    void chrome.storage.sync.set({ [THEME_KEY]: msg.theme }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
