// Cross-platform "keep the screen on" wrapper.
// - On native (Capacitor): uses @capacitor-community/keep-awake.
// - On web: uses the Screen Wake Lock API when available.
// All calls are best-effort and never throw to the caller.

let webLock: WakeLockSentinel | null = null;

const isNative = (): boolean => {
  const w = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
};

export async function keepAwakeOn(): Promise<void> {
  try {
    if (isNative()) {
      const { KeepAwake } = await import("@capacitor-community/keep-awake");
      await KeepAwake.keepAwake();
      return;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (nav.wakeLock?.request) {
      webLock = await nav.wakeLock.request("screen");
    }
  } catch {
    /* best-effort */
  }
}

export async function keepAwakeOff(): Promise<void> {
  try {
    if (isNative()) {
      const { KeepAwake } = await import("@capacitor-community/keep-awake");
      await KeepAwake.allowSleep();
      return;
    }
    if (webLock) {
      await webLock.release();
      webLock = null;
    }
  } catch {
    /* best-effort */
  }
}