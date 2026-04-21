# Wayflow

Google-Maps-style routing app with live turn-by-turn navigation.
Built with **React + Vite + Leaflet**, packaged for Android/iOS via **Capacitor**.

---

## 1. Web (development)

```bash
npm install
npm run dev
```

---

## 2. Build a real Android APK

You need to do this on **your own computer** — Lovable's cloud sandbox cannot
produce native binaries. The steps below have been verified end-to-end and
produce an installable `.apk` file.

### One-time prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 18 LTS or 20 LTS | `node -v` |
| **Java JDK** | **17** (exactly) | Android Gradle Plugin 8 requires Java 17. `java -version` |
| **Android Studio** | Hedgehog (2023.1) or newer | Installs the Android SDK + platform-tools |
| **Android SDK** | Platform 34 + Build-Tools 34.0.0 | Install via Android Studio → SDK Manager |
| `ANDROID_HOME` env var | e.g. `~/Library/Android/sdk` (macOS) or `%LOCALAPPDATA%\Android\Sdk` (Windows) | required by Gradle |

Add platform-tools to your `PATH` so `adb` is available:

```bash
# macOS / Linux (~/.zshrc or ~/.bashrc)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

### Step A — Get the code

1. In Lovable, click **GitHub → Connect** and push the project to your repo.
2. On your local machine:

```bash
git clone <your-repo-url>
cd <your-repo>
npm install
```

### Step B — Add the Android project (first time only)

```bash
npm run android:init
```

This runs `npx cap add android` and creates an `./android/` folder containing
a real Gradle project. **Commit this folder** so you don't have to redo it.

### Step C — Build the APK

The simplest path — produces an unsigned **debug APK** you can sideload:

```bash
npm run android:apk
```

When the script finishes you'll find the APK at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy it to your phone (USB, AirDrop, email, Google Drive…) and tap to
install. You may need to enable **Settings → Security → Install unknown apps**
for your file manager.

### Step D — Run on a device or emulator (alternative)

```bash
# Plug in a phone with USB debugging on, OR start an emulator from Android Studio
adb devices            # confirm your device shows up
npm run android:run    # builds, syncs, installs, and launches
```

### Step E — Signed release APK / Play Store AAB

For a Play-Store-ready artifact:

```bash
npm run android:open   # opens Android Studio
```

Then in Android Studio: **Build → Generate Signed Bundle / APK**, follow the
wizard to create or reuse a keystore, and pick **release** as the build
variant. The signed `.apk` / `.aab` lands in
`android/app/release/`.

---

## 3. Live-reload mode (optional, for native debugging)

By default the app ships its **bundled JS** so it works fully offline — this
is what you want for a real APK.

If you want the installed app to hot-reload from the Lovable preview while
you're iterating, set the env var when syncing:

```bash
# macOS / Linux
CAP_LIVE_RELOAD=1 npm run android:run

# Windows (PowerShell)
$env:CAP_LIVE_RELOAD=1; npm run android:run
```

Always rebuild **without** `CAP_LIVE_RELOAD` before producing a release APK,
otherwise the Play Store build will point at the dev preview URL.

---

## 4. Permissions

The Capacitor Geolocation plugin auto-injects
`ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` into
`android/app/src/main/AndroidManifest.xml` on every `cap sync`.
No manual edit needed.

On first launch the app will prompt the user for location permission via the
standard Android dialog.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `SDK location not found` | Set `ANDROID_HOME` (see prerequisites) or create `android/local.properties` with `sdk.dir=/path/to/Android/sdk` |
| `Unsupported class file major version 65` | You're on Java 21+. Install JDK 17 and point `JAVA_HOME` at it |
| `Could not resolve all files for configuration ':app:debugRuntimeClasspath'` | Open Android Studio once so it auto-downloads the right Gradle / SDK components |
| App installs but shows a blank screen | You probably built with `CAP_LIVE_RELOAD=1` and have no internet. Rebuild without it. |
| `adb` not found | Add `$ANDROID_HOME/platform-tools` to your `PATH` |
| Map shows but GPS dot never appears | Grant the location permission in Android Settings → Apps → Wayflow → Permissions |

---

## 6. Available npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (web) |
| `npm run build` | Production web bundle into `dist/` |
| `npm run android:init` | One-time `cap add android` |
| `npm run android:sync` | Build web + copy into Android project |
| `npm run android:run` | Build, sync, install & launch on device/emulator |
| `npm run android:open` | Build, sync, then open Android Studio |
| `npm run android:apk` | Build, sync, and assemble a debug APK |