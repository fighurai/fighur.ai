const THEME_KEY = "fighurPageTheme";
const ENTITLEMENT_KEY = "fighurEntitlement";

const DEFAULT_THEME = {
  enabled: false,
  bg: "#EEFF00",
  fg: "#1432F5",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([THEME_KEY], (data) => {
    if (!data?.[THEME_KEY]) {
      void chrome.storage.sync.set({ [THEME_KEY]: DEFAULT_THEME });
    }
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  ) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "fighur-colors-toggle" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["panel.css"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "fighur-colors-toggle" });
    } catch {
      /* restricted page */
    }
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
