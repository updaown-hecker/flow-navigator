// Cross-platform geolocation: Capacitor on native, browser API on web.
// Falls back gracefully and reports a useful reason on failure.

import type { LngLat } from "./navigation";

export type GeoErrorReason = "denied" | "unsupported" | "timeout" | "unavailable";

export interface GeoResult {
  pos: LngLat;
  accuracy: number;
}

const isNative = (): boolean => {
  // Capacitor v6 sets this when running inside a native shell.
  // Use a runtime check so the web build doesn't break.
  const w = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
};

export async function getCurrentPosition(): Promise<GeoResult> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await Geolocation.requestPermissions({ permissions: ["location"] });
        if (req.location !== "granted") {
          throw Object.assign(new Error("denied"), { reason: "denied" as GeoErrorReason });
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      return {
        pos: [pos.coords.longitude, pos.coords.latitude],
        accuracy: pos.coords.accuracy ?? 0,
      };
    } catch (err: unknown) {
      const reason = (err as { reason?: GeoErrorReason }).reason ?? "unavailable";
      throw Object.assign(new Error(reason), { reason });
    }
  }

  // Web
  if (!("geolocation" in navigator)) {
    throw Object.assign(new Error("unsupported"), { reason: "unsupported" as GeoErrorReason });
  }
  return new Promise<GeoResult>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          pos: [pos.coords.longitude, pos.coords.latitude],
          accuracy: pos.coords.accuracy ?? 0,
        }),
      (err) => {
        const reason: GeoErrorReason =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        reject(Object.assign(new Error(reason), { reason }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
