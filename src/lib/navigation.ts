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
const PHOTON = "https://photon.komoot.io";
const OSRM = "https://router.project-osrm.org";
const OVERPASS = "https://overpass-api.de/api/interpreter";

// ---------- Search ----------
// Hybrid Photon + Nominatim search. Photon (Komoot) is an autocomplete-first
// geocoder built on OSM data — it returns results from 2 characters and
// honors lat/lon biasing natively, which makes "123 Main St" resolve to the
// nearest match without typing the city/state. Nominatim runs in parallel as
// a fallback for full-address queries Photon misses.
export interface SearchOptions {
  bias?: LngLat | null; // [lon, lat]
  signal?: AbortSignal;
}

interface RawHit {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  source: "photon" | "nominatim";
}

const haversineKm = (a: LngLat, b: LngLat) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function searchPhoton(q: string, opts: SearchOptions): Promise<RawHit[]> {
  const params = new URLSearchParams({ q, limit: "10", lang: "en" });
  if (opts.bias) {
    params.set("lon", String(opts.bias[0]));
    params.set("lat", String(opts.bias[1]));
    // Higher = stronger location bias (default 0.2).
    params.set("location_bias_scale", "0.6");
    params.set("zoom", "12");
  }
  try {
    const res = await fetch(`${PHOTON}/api/?${params}`, { signal: opts.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: {
      properties: Record<string, string | number | undefined>;
      geometry: { coordinates: [number, number] };
    }) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const name = (p.name as string) || (p.street as string) || "";
      const housenumber = p.housenumber ? `${p.housenumber} ` : "";
      const street = p.street && p.name !== p.street ? p.street : "";
      const city = p.city || p.town || p.village || p.county || "";
      const region = p.state || p.country || "";
      const shortBase = housenumber + (name || street || `${city}`);
      const longParts = [shortBase, street && street !== name ? street : "", city, region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      return {
        id: `ph-${p.osm_type}${p.osm_id}`,
        label: longParts.join(", "),
        shortLabel: shortBase || (longParts[0] as string) || "Unnamed",
        lat,
        lon,
        source: "photon" as const,
      };
    });
  } catch {
    return [];
  }
}

async function searchNominatim(q: string, opts: SearchOptions): Promise<RawHit[]> {
  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "8",
    q,
  });
  if (opts.bias) {
    const [lon, lat] = opts.bias;
    const dLat = 0.75;
    const dLon = 0.75 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    params.set("viewbox", `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`);
    params.set("bounded", "0");
  }
  try {
    const res = await fetch(`${NOMINATIM}/search?${params}`, {
      signal: opts.signal,
      headers: { "Accept-Language": navigator.language || "en" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      name?: string;
      lat: string;
      lon: string;
    }>;
    return data.map((d) => ({
      id: `nm-${d.place_id}`,
      label: d.display_name,
      shortLabel: d.name || d.display_name.split(",")[0],
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      source: "nominatim" as const,
    }));
  } catch {
    return [];
  }
}

export async function searchPlaces(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Run Photon (fast autocomplete) and Nominatim (full address coverage) in parallel.
  const [photon, nominatim] = await Promise.all([
    searchPhoton(q, opts),
    // Skip Nominatim for very short prefixes (Photon handles them better)
    q.length >= 4 ? searchNominatim(q, opts) : Promise.resolve([] as RawHit[]),
  ]);

  // Merge + dedupe by rounded coordinate (~50m).
  const seen = new Set<string>();
  const merged: RawHit[] = [];
  for (const hit of [...photon, ...nominatim]) {
    const key = `${hit.lat.toFixed(3)},${hit.lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }

  // Rank by distance to bias when available, otherwise preserve provider order.
  if (opts.bias) {
    const bias = opts.bias;
    merged.sort((a, b) => {
      const da = haversineKm(bias, [a.lon, a.lat]);
      const db = haversineKm(bias, [b.lon, b.lat]);
      // Photon hits get a small bonus since they're optimized for autocomplete.
      const sa = da - (a.source === "photon" ? 1 : 0);
      const sb = db - (b.source === "photon" ? 1 : 0);
      return sa - sb;
    });
  }

  return merged.slice(0, 10).map(({ source: _source, ...rest }) => rest);
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

// Get the primary route + (optionally) up to 2 alternatives. When stops are
// included, the OSRM Trip API is used first to reorder intermediate stops for
// the most efficient sequence; alternatives are fetched separately on the
// resulting waypoint order so all routes share the same stop sequence.
export async function fetchRoutes(
  points: LngLat[],
  withAlternatives = true,
): Promise<{ routes: RouteResult[]; waypointOrder: number[] }> {
  // 1. Optimal stop sequence (only matters if there are intermediate stops)
  let orderedPoints = points;
  let waypointOrder = points.map((_, i) => i);

  if (points.length >= 3) {
    try {
      const coords = points.map((p) => `${p[0]},${p[1]}`).join(";");
      const url = `${OSRM}/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false&overview=false`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.trips?.length) {
          const order = (data.waypoints as Array<{ waypoint_index: number }>)
            .map((w, i) => ({ original: i, order: w.waypoint_index }))
            .sort((a, b) => a.order - b.order)
            .map((w) => w.original);
          waypointOrder = order;
          orderedPoints = order.map((i) => points[i]);
        }
      }
    } catch {
      /* fall back to original order */
    }
  }

  // 2. Fetch primary + alternatives along the chosen waypoint order
  const routes = await fetchRoute(orderedPoints, withAlternatives);
  return { routes, waypointOrder };
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
