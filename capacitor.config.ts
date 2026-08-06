import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Hybrid iOS shell: loads production fighur.ai in WKWebView.
 * After Apple enrollment: `npx cap add ios && npx cap sync ios && npx cap open ios`
 */
const config: CapacitorConfig = {
  appId: "ai.fighur.app",
  appName: "FIGHURAI",
  webDir: "native/www",
  server: {
    // Production app loads the live site (Path B hybrid).
    url: "https://fighur.ai",
    cleartext: false,
    allowNavigation: ["fighur.ai", "*.fighur.ai", "appleid.apple.com"],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "fighur",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
  },
};

export default config;
