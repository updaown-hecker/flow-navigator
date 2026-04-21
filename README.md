# Wayflow

A Google-Maps-style routing app with live turn-by-turn navigation, built on React + Vite + Leaflet, and packaged for Android/iOS via Capacitor.

## Web (dev)

```bash
npm install
npm run dev
```

## Build a real Android APK / AAB

The project is already wired up with Capacitor (`capacitor.config.ts`,
`appId: app.lovable.f20041204d4e45f08ad4881348437ce1`).

> Prereqs: **Node 18+**, **Android Studio** (with the Android SDK + a virtual
> device or a USB-debugging phone), and **Java 17**.

First-time setup (do this once after cloning the repo from GitHub):

```bash
# 1. Install JS deps
npm install

# 2. Add the Android native project (creates ./android)
npx cap add android
```

Each time you want to ship/install a build:

```bash
# 3. Build the web bundle
npm run build

# 4. Push the bundle into the Android project
npx cap sync android

# 5a. Run on an emulator / connected device
npx cap run android

# 5b. ...or open Android Studio to produce a signed APK / AAB
npx cap open android
```

In Android Studio: **Build → Generate Signed Bundle / APK** to produce a
release artifact for the Play Store or sideloading.

### Production vs. dev hot reload

`capacitor.config.ts` currently points `server.url` at the Lovable preview so
the installed app hot-reloads from the cloud sandbox. For a **standalone
production APK** that runs the bundled JS offline, comment out (or delete) the
`server` block before running `npm run build && npx cap sync android`:

```ts
// server: {
//   url: "https://...lovableproject.com?forceHideBadge=true",
//   cleartext: true,
// },
```

### Permissions

The Geolocation plugin auto-injects `ACCESS_FINE_LOCATION` /
`ACCESS_COARSE_LOCATION` into `android/app/src/main/AndroidManifest.xml` on
`cap sync`. No manual edit needed.
