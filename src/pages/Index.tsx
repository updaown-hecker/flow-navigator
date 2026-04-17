import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { toast } from "sonner";
import { Compass, Crosshair, Loader2, MapPin, Navigation as NavIcon } from "lucide-react";
import { MapView } from "@/components/MapView";
import { SearchBox } from "@/components/SearchBox";
import { BottomSheet } from "@/components/BottomSheet";
import {
  buildForwardCorridor,
  fetchOptimizedTrip,
  fetchPoisInBbox,
  filterForwardPois,
  polygonBbox,
  type LngLat,
  type Poi,
  type PoiCategory,
  type RouteResult,
  type SearchResult,
} from "@/lib/navigation";

const MY_LOCATION_LABEL = "My location";

const Index = () => {
  const [userPos, setUserPos] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState(true);

  // Origin: either tracks GPS (origin === null && userPos set), or a manually picked place.
  const [originPlace, setOriginPlace] = useState<SearchResult | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [originEditing, setOriginEditing] = useState(false);

  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<SearchResult | null>(null);

  const [stops, setStops] = useState<SearchResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [stopQuery, setStopQuery] = useState("");

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [corridor, setCorridor] = useState<GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  > | null>(null);

  const [poiCategory, setPoiCategory] = useState<PoiCategory | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);

  const [navigating, setNavigating] = useState(false);
  const [focusBounds, setFocusBounds] = useState<L.LatLngBoundsExpression | null>(null);
  const poiAbort = useRef<AbortController | null>(null);

  // Resolved origin coordinate
  const originCoord: LngLat | null = useMemo(() => {
    if (originPlace) return [originPlace.lon, originPlace.lat];
    if (userPos) return userPos;
    return null;
  }, [originPlace, userPos]);

  // ---- Geolocation ----
  const requestLocation = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      setGpsAvailable(false);
      if (!silent) toast.error("Geolocation not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.longitude, pos.coords.latitude]);
        setGpsAvailable(true);
        setLocating(false);
        setOriginPlace(null); // snap origin back to GPS
        setOriginQuery("");
      },
      (err) => {
        setLocating(false);
        setGpsAvailable(false);
        if (!silent) {
          toast.error(
            err.code === err.PERMISSION_DENIED
              ? "Location blocked. Type a starting point in the From field."
              : "Couldn't get your location. Type a starting point manually.",
            { duration: 5000 },
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    requestLocation(true);
  }, [requestLocation]);

  // ---- Compute route whenever waypoints change ----
  useEffect(() => {
    if (!originCoord || !destination) {
      setRoute(null);
      setCorridor(null);
      setPois([]);
      setFocusBounds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRouteLoading(true);
      try {
        const points: LngLat[] = [
          originCoord,
          ...stops.map((s) => [s.lon, s.lat] as LngLat),
          [destination.lon, destination.lat],
        ];
        const r = await fetchOptimizedTrip(points);
        if (cancelled) return;
        setRoute(r);
        const coords = r.geometry.coordinates;
        const lats = coords.map((c) => c[1]);
        const lons = coords.map((c) => c[0]);
        setFocusBounds([
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ]);
      } catch {
        if (!cancelled) toast.error("Couldn't compute the route.");
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [originCoord, destination, stops]);

  // ---- Fetch + filter POIs whenever category or route changes ----
  useEffect(() => {
    if (!poiCategory || !route || !originCoord) {
      setPois([]);
      setCorridor(null);
      return;
    }
    poiAbort.current?.abort();
    const ctl = new AbortController();
    poiAbort.current = ctl;

    (async () => {
      setPoiLoading(true);
      try {
        const { corridor: corr, snappedKm } = buildForwardCorridor(
          route.geometry,
          originCoord,
          1.5,
          120,
        );
        if (ctl.signal.aborted) return;
        setCorridor(corr);
        const bbox = polygonBbox(corr);
        const raw = await fetchPoisInBbox(poiCategory, bbox);
        if (ctl.signal.aborted) return;
        const filtered = filterForwardPois(
          raw,
          poiCategory,
          route.geometry,
          originCoord,
          corr,
          snappedKm,
        );
        setPois(filtered);
        if (filtered.length === 0) {
          toast.message(`No ${poiCategory} found ahead on this route.`);
        }
      } catch {
        if (!ctl.signal.aborted) toast.error("Couldn't load points of interest.");
      } finally {
        if (!ctl.signal.aborted) setPoiLoading(false);
      }
    })();
    return () => ctl.abort();
  }, [poiCategory, route, originCoord]);

  const handleSelectDestination = (r: SearchResult) => {
    setDestination(r);
    setDestinationQuery(r.shortLabel);
  };

  const handleSelectOrigin = (r: SearchResult) => {
    setOriginPlace(r);
    setOriginQuery(r.shortLabel);
    setOriginEditing(false);
  };

  const handleAddStopSelect = (r: SearchResult) => {
    setStops((s) => [...s, r]);
    setStopQuery("");
    setAdding(false);
  };

  const handleAddPoiAsStop = (poi: Poi) => {
    setStops((s) => [
      ...s,
      {
        id: poi.id,
        label: poi.name,
        shortLabel: poi.name,
        lat: poi.lat,
        lon: poi.lon,
      },
    ]);
    setPoiCategory(null);
    toast.success(`Added ${poi.name} to your route`);
  };

  const clearRoute = () => {
    setDestination(null);
    setDestinationQuery("");
    setStops([]);
    setNavigating(false);
    setPoiCategory(null);
  };

  const stopsCoords = useMemo<LngLat[]>(() => stops.map((s) => [s.lon, s.lat]), [stops]);

  const originLabel = originPlace ? originPlace.shortLabel : userPos ? MY_LOCATION_LABEL : "";
  const showOriginField = originEditing || (!userPos && !originPlace);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-glow" aria-hidden />

      <MapView
        userPos={userPos}
        origin={originCoord}
        destination={destination ? [destination.lon, destination.lat] : null}
        stops={stopsCoords}
        route={route}
        pois={pois}
        corridor={corridor}
        focusBounds={focusBounds}
      />

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex justify-center px-3 pt-3">
        <div className="pointer-events-auto w-full max-w-xl space-y-2">
          <div className="glass flex items-center justify-between gap-2 rounded-2xl px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-route shadow-glow">
                <Compass className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <h1 className="text-sm font-bold tracking-tight text-foreground">Wayflow</h1>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Forward-flow OSM nav
                </p>
              </div>
            </div>
            <button
              onClick={() => requestLocation(false)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              aria-label="Use my GPS location"
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crosshair className="h-3.5 w-3.5" />
              )}
              Use GPS
            </button>
          </div>

          {/* From (origin) */}
          {showOriginField ? (
            <SearchBox
              variant="compact"
              value={originQuery}
              onChange={setOriginQuery}
              onSelect={handleSelectOrigin}
              placeholder={
                gpsAvailable ? "From — type an address or use GPS" : "From — type a starting address"
              }
              autoFocus={!userPos && !originPlace}
            />
          ) : (
            <button
              onClick={() => {
                setOriginEditing(true);
                setOriginQuery(originPlace?.shortLabel ?? "");
              }}
              className="glass flex h-12 w-full items-center gap-2 rounded-2xl px-4 text-left transition hover:border-primary/40"
            >
              <MapPin className="h-4 w-4 text-secondary" />
              <span className="flex-1 truncate text-sm text-foreground">
                <span className="text-muted-foreground">From: </span>
                {originLabel}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Change
              </span>
            </button>
          )}

          {/* To (destination) */}
          <SearchBox
            value={destinationQuery}
            onChange={setDestinationQuery}
            onSelect={handleSelectDestination}
            onClear={clearRoute}
            placeholder="Where to?"
          />

          {adding && (
            <SearchBox
              variant="compact"
              autoFocus
              value={stopQuery}
              onChange={setStopQuery}
              onSelect={handleAddStopSelect}
              placeholder="Add a stop along the way…"
            />
          )}

          {!destination && !routeLoading && originCoord && (
            <div className="glass mt-1 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <NavIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Search a destination, then tap{" "}
                <span className="font-semibold text-primary">Gas</span>,{" "}
                <span className="font-semibold text-primary">Food</span>, or{" "}
                <span className="font-semibold text-primary">Rest</span> to find stops on the way —
                never a U-turn away.
              </span>
            </div>
          )}

          {!originCoord && !locating && (
            <div className="glass mt-1 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <span>
                Location is blocked in this preview. Type a starting address in the{" "}
                <span className="font-semibold text-foreground">From</span> field above to begin.
              </span>
            </div>
          )}

          {routeLoading && (
            <div className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating optimal route…
            </div>
          )}
        </div>
      </header>

      <BottomSheet
        route={route}
        destination={destination?.shortLabel ?? null}
        stopsCount={stops.length}
        poiCategory={poiCategory}
        pois={pois}
        poiLoading={poiLoading}
        onPickPoi={setPoiCategory}
        onAddStop={() => setAdding((v) => !v)}
        onAddPoiAsStop={handleAddPoiAsStop}
        onClearRoute={clearRoute}
        onStartNav={() => setNavigating((v) => !v)}
        isNavigating={navigating}
      />
    </main>
  );
};

export default Index;
