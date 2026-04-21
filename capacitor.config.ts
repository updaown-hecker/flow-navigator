import type { CapacitorConfig } from "@capacitor/cli";

// Hot-reload from the Lovable preview only when explicitly requested.
// Set CAP_LIVE_RELOAD=1 before `npx cap sync android` to enable it.
// Production APK/AAB builds MUST run without this so the app uses the bundled JS.
const useLiveReload = process.env.CAP_LIVE_RELOAD === "1";

const config: CapacitorConfig = {
  appId: "app.lovable.f20041204d4e45f08ad4881348437ce1",
  appName: "Wayflow",
  webDir: "dist",
  ...(useLiveReload
    ? {
        server: {
          url: "https://f2004120-4d4e-45f0-8ad4-881348437ce1.lovableproject.com?forceHideBadge=true",
          cleartext: true,
        },
      }
    : {}),
  plugins: {
    Geolocation: {
      // Android permissions are added automatically by the plugin.
      // iOS: NSLocationWhenInUseUsageDescription must be set in Info.plist
      // (the plugin's docs guide you through this on `npx cap add ios`).
    },
  },
};

export default config;
