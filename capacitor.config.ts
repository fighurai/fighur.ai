import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Hybrid iOS shell: loads production fighur.ai in WKWebView.
 * After Apple enrollment: `npx cap add ios && npx cap sync ios && npx cap open ios`
 */
const config: CapacitorConfig = {
  appId: "ai.fighur.app",
  appName: "FIGHURAI",
  webDir: "native/www",
  backgroundColor: "#08090d",
  server: {
    // Production app loads the live site (Path B hybrid).
    // Query busts WKWebView's stale HTML/JS cache after each UI ship.
    url: "https://fighur.ai/?n=6",
    cleartext: false,
    allowNavigation: ["fighur.ai", "*.fighur.ai", "appleid.apple.com"],
  },
  ios: {
    // never = color fills the whole screen; safe areas via CSS env()
    contentInset: "never",
    preferredContentMode: "mobile",
    scheme: "fighur",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
    Keyboard: {
      resize: "none",
      style: "dark",
      resizeOnFullScreen: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT",
    },
  },
};

export default config;
