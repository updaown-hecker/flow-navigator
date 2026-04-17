// Wayflow navigation utilities — OSRM routing, Nominatim search, Overpass POIs,
// and the "forward-flow" corridor filter that hides anything requiring a U-turn.

import * as turf from "@turf/turf";

export type LngLat = [number, number]; // [lon, lat]

export interface SearchResult {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
}

export interface RouteResult {
  geometry: GeoJSON.LineString;
  distance: number; // meters
  duration: number; // seconds
  legs: { distance: number; duration: number }[];
  waypointOrder: number[]; // index map for trip reordering
}

export type PoiCategory = "gas" | "food" | "rest";

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lon: number;
  detourMeters: number;
  forwardKm: number; // distance along route from start
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";
const OVERPASS = "https://overpass-api.de/api/interpreter";

// ---------- Search ----------
// Location-biased Nominatim search. With a `bias` (typically the user's GPS
// or current map center), short queries like "123 Main St" resolve to the
// nearest match without requiring city/state.
export interface SearchOptions {
  bias?: LngLat | null; // [lon, lat]
  signal?: AbortSignal;
}

export async function searchPlaces(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "8",
    q,
  });

  if (opts.bias) {
    const [lon, lat] = opts.bias;
    // ~80km box around the bias point — strong locality preference but not exclusive.
    const dLat = 0.75;
    const dLon = 0.75 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    params.set("viewbox", `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`);
    params.set("bounded", "0"); // soft bias, not a hard filter
  }

  const res = await fetch(`${NOMINATIM}/search?${params.toString()}`, {
    signal: opts.signal,
    headers: { "Accept-Language": navigator.language || "en" },
  });
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
  }>;
  return data.map((d) => ({
    id: String(d.place_id),
    label: d.display_name,
    shortLabel: d.name || d.display_name.split(",")[0],
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
  }));
}

// ---------- Routing (OSRM) ----------
export async function fetchRoute(
  points: LngLat[],
  alternatives = false,
): Promise<RouteResult[]> {
  if (points.length < 2) throw new Error("Need at least 2 points");
  const coords = points.map((p) => `${p[0]},${p[1]}`).join(";");
  const altParam = alternatives ? "true" : "false";
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${altParam}&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Route failed");
  const data = await res.json();
  if (!data.routes?.length) throw new Error("No route");
  return (data.routes as Array<{
    geometry: GeoJSON.LineString;
    distance: number;
    duration: number;
    legs: Array<{ distance: number; duration: number }>;
  }>).map((r) => ({
    geometry: r.geometry,
    distance: r.distance,
    duration: r.duration,
    legs: r.legs.map((l) => ({ distance: l.distance, duration: l.duration })),
    waypointOrder: points.map((_, i) => i),
  }));
}

// OSRM Trip API — reorder intermediate stops for the most efficient sequence.
// Start fixed, end fixed, intermediate stops reorderable.
export async function fetchOptimizedTrip(points: LngLat[]): Promise<RouteResult> {
  if (points.length < 3) return fetchRoute(points);
  const coords = points.map((p) => `${p[0]},${p[1]}`).join(";");
  const url = `${OSRM}/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false&overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return fetchRoute(points);
  const data = await res.json();
  if (!data.trips?.length) return fetchRoute(points);
  const t = data.trips[0];
  const order = (data.waypoints as Array<{ waypoint_index: number }>)
    .map((w, i) => ({ original: i, order: w.waypoint_index }))
    .sort((a, b) => a.order - b.order)
    .map((w) => w.original);
  return {
    geometry: t.geometry,
    distance: t.distance,
    duration: t.duration,
    legs: t.legs.map((l: { distance: number; duration: number }) => ({
      distance: l.distance,
      duration: l.duration,
    })),
    waypointOrder: order,
  };
}

// ---------- Forward-flow corridor ----------
// Build a buffered polygon along the *remaining* portion of the route from the
// user's current position. Only POIs inside this corridor are considered, and
// each must have a forward-facing deviation angle < 90°.
export function buildForwardCorridor(
  route: GeoJSON.LineString,
  userPos: LngLat,
  corridorKm = 1.5,
  lookaheadKm = 60,
) {
  const line = turf.lineString(route.coordinates);
  const userPt = turf.point(userPos);
  const snapped = turf.nearestPointOnLine(line, userPt, { units: "kilometers" });
  const sliceStart = snapped;
  const totalKm = turf.length(line, { units: "kilometers" });
  const endKm = Math.min(totalKm, (snapped.properties.location ?? 0) + lookaheadKm);
  const sliceEnd = turf.along(line, endKm, { units: "kilometers" });
  const ahead = turf.lineSlice(sliceStart, sliceEnd, line);
  const corridor = turf.buffer(ahead, corridorKm, { units: "kilometers" });
  return { ahead, corridor: corridor!, snappedKm: snapped.properties.location ?? 0 };
}

// ---------- Overpass POIs ----------
const OVERPASS_QUERIES: Record<PoiCategory, string> = {
  gas: 'node["amenity"="fuel"]',
  food: 'node["amenity"~"restaurant|fast_food|cafe"]',
  rest: 'node["highway"~"rest_area|services"];node["tourism"="picnic_site"]',
};

export async function fetchPoisInBbox(
  category: PoiCategory,
  bbox: [number, number, number, number], // [s, w, n, e]
): Promise<Array<{ id: string; name: string; lat: number; lon: number }>> {
  const [s, w, n, e] = bbox;
  const filters = OVERPASS_QUERIES[category]
    .split(";")
    .filter(Boolean)
    .map((q) => `${q}(${s},${w},${n},${e});`)
    .join("");
  const body = `[out:json][timeout:25];(${filters});out tags center 80;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    body: "data=" + encodeURIComponent(body),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error("Overpass failed");
  const data = (await res.json()) as {
    elements: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>;
  };
  return data.elements
    .filter((el) => el.lat && el.lon)
    .map((el) => ({
      id: String(el.id),
      name: el.tags?.name || el.tags?.brand || "Unnamed",
      lat: el.lat!,
      lon: el.lon!,
    }));
}

// ---------- Forward-filter algorithm ----------
// 1. Inside the corridor polygon
// 2. Forward of the user along the route (forwardKm > snappedKm)
// 3. Heading deviation < 90° between current bearing and bearing-to-POI
export function filterForwardPois(
  pois: Array<{ id: string; name: string; lat: number; lon: number }>,
  category: PoiCategory,
  route: GeoJSON.LineString,
  userPos: LngLat,
  corridor: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  snappedKm: number,
): Poi[] {
  const line = turf.lineString(route.coordinates);
  const totalKm = turf.length(line, { units: "kilometers" });

  // Current heading: bearing from user-snapped point to a point ~250m ahead.
  const aheadProbe = turf.along(line, Math.min(totalKm, snappedKm + 0.25), {
    units: "kilometers",
  });
  const userPt = turf.point(userPos);
  const heading = turf.bearing(userPt, aheadProbe);

  return pois
    .map((p): Poi | null => {
      const pt = turf.point([p.lon, p.lat]);
      if (!turf.booleanPointInPolygon(pt, corridor)) return null;

      const snap = turf.nearestPointOnLine(line, pt, { units: "kilometers" });
      const forwardKm = (snap.properties.location ?? 0) - snappedKm;
      if (forwardKm <= 0.05) return null; // behind us

      const bearingToPoi = turf.bearing(userPt, pt);
      const dev = Math.abs(((bearingToPoi - heading + 540) % 360) - 180);
      if (dev >= 90) return null; // would require U-turn

      const detourMeters =
        turf.distance(pt, snap, { units: "kilometers" }) * 1000 * 2; // round-trip side trip

      return {
        id: `${category}-${p.id}`,
        name: p.name,
        category,
        lat: p.lat,
        lon: p.lon,
        detourMeters,
        forwardKm,
      };
    })
    .filter((p): p is Poi => p !== null)
    // Closest-ahead first, with a small detour penalty so a tiny side-trip
    // beats one that's slightly closer but far off the route.
    .sort(
      (a, b) =>
        a.forwardKm + a.detourMeters / 2000 - (b.forwardKm + b.detourMeters / 2000),
    )
    .slice(0, 30);
}

// ---------- Formatters ----------
export const fmtKm = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

export const fmtDuration = (s: number) => {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
};

// Bbox helper from a polygon
export function polygonBbox(
  poly: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): [number, number, number, number] {
  const [w, s, e, n] = turf.bbox(poly);
  return [s, w, n, e];
}
