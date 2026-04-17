import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.f20041204d4e45f08ad4881348437ce1",
  appName: "Wayflow",
  webDir: "dist",
  server: {
    url: "https://f2004120-4d4e-45f0-8ad4-881348437ce1.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    Geolocation: {
      // Android permissions are added automatically by the plugin.
      // iOS: NSLocationWhenInUseUsageDescription must be set in Info.plist
      // (the plugin's docs guide you through this on `npx cap add ios`).
    },
  },
};

export default config;
