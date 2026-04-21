import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { toast } from "sonner";
import {
  Crosshair,
  Loader2,
  MapPin,
  Home as HomeIcon,
  Briefcase,
  Star,
  ArrowLeft,
  Plus,
  X,
  Car,
  Footprints,
  Layers,
  Navigation as NavigationIcon,
} from "lucide-react";
import { MapView } from "@/components/MapView";
import { SearchBox } from "@/components/SearchBox";
import { TripSummary, TripControls } from "@/components/BottomSheet";
import { DraggableSheet } from "@/components/DraggableSheet";
import { Splash } from "@/components/Splash";
import { Onboarding } from "@/components/Onboarding";
import { SettingsMenu } from "@/components/SettingsMenu";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import {
  buildForwardCorridor,
  fetchPoisInBbox,
  fetchRoutes,
  findNextStep,
  filterForwardPois,
  fmtDuration,
  fmtKm,
  polygonBbox,
  type LngLat,
  type Poi,
  type PoiCategory,
  type RouteResult,
  type SearchResult,
  type TravelProfile,
} from "@/lib/navigation";
import { getCurrentPosition, watchPosition, type GeoErrorReason, type GeoWatch } from "@/lib/geo";
import {
  addRecent,
  clearRecents,
  getHome,
  getMapStyle,
  getRecents,
  getTheme,
  getWork,
  isOnboarded,
  setAppTheme,
  setHome as persistHome,
  setMapStyleId,
  setOnboarded,
  setWork as persistWork,
  type AppTheme,
  type MapStyleId,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

const Index = () => {
  const [userPos, setUserPos] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsBlocked, setGpsBlocked] = useState(false);

  // Origin (null + userPos = "My location"; otherwise a manually picked place)
  const [originPlace, setOriginPlace] = useState<SearchResult | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [originEditing, setOriginEditing] = useState(false);

  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<SearchResult | null>(null);

  const [stops, setStops] = useState<SearchResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [stopQuery, setStopQuery] = useState("");

  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
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

  // Travel profile + live navigation
  const [profile, setProfile] = useState<TravelProfile>("driving");
  const [following, setFollowing] = useState(true);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const watchRef = useRef<GeoWatch | null>(null);

  // Persistence-backed state
  const [home, setHomeState] = useState<SearchResult | null>(() => getHome());
  const [work, setWorkState] = useState<SearchResult | null>(() => getWork());
  const [recents, setRecents] = useState<SearchResult[]>(() => getRecents());

  // Startup gates
  const [splashing, setSplashing] = useState(true);
  const [onboarding, setOnboarding] = useState(() => !isOnboarded());

  // Theme + map style
  const [theme, setThemeState] = useState<AppTheme>(() => getTheme());
  const [mapStyle, setMapStyleState] = useState<MapStyleId>(() => getMapStyle());

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-midnight", "dark");
    if (theme === "light") root.classList.add("theme-light");
    else if (theme === "midnight") root.classList.add("theme-midnight");
    else root.classList.add("dark");
  }, [theme]);

  const handleChangeTheme = (t: AppTheme) => {
    setThemeState(t);
    setAppTheme(t);
  };
  const handleChangeMapStyle = (s: MapStyleId) => {
    setMapStyleState(s);
    setMapStyleId(s);
  };


  const originCoord: LngLat | null = useMemo(() => {
    if (originPlace) return [originPlace.lon, originPlace.lat];
    if (userPos) return userPos;
    return null;
  }, [originPlace, userPos]);

  const activeRoute = routes[activeRouteIdx] ?? null;

  // ---- Geolocation (cross-platform) ----
  const requestLocation = useCallback(async (silent = false) => {
    setLocating(true);
    try {
      const { pos } = await getCurrentPosition();
      setUserPos(pos);
      setGpsBlocked(false);
      setOriginPlace(null);
      setOriginQuery("");
    } catch (err: unknown) {
      const reason = (err as { reason?: GeoErrorReason }).reason ?? "unavailable";
      setGpsBlocked(true);
      if (!silent) {
        const msg =
          reason === "denied"
            ? "Location blocked. Enable it in your browser/app settings, or type a starting point in From."
            : reason === "unsupported"
              ? "This device doesn't support geolocation."
              : reason === "timeout"
                ? "Location request timed out. Try again or type a starting point."
                : "Couldn't read GPS. Type a starting point in From.";
        toast.error(msg, { duration: 5000 });
      }
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    requestLocation(true);
  }, [requestLocation]);

  // ---- Compute routes whenever waypoints change ----
  useEffect(() => {
    if (!originCoord || !destination) {
      setRoutes([]);
      setActiveRouteIdx(0);
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
        const { routes: rs } = await fetchRoutes(points, true, profile);
        if (cancelled) return;
        setRoutes(rs);
        setActiveRouteIdx(0);
        const coords = rs[0].geometry.coordinates;
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
  }, [originCoord, destination, stops, profile]);

  // ---- Fetch + filter POIs against the *active* route ----
  useEffect(() => {
    if (!poiCategory || !activeRoute || !originCoord) {
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
          activeRoute.geometry,
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
          activeRoute.geometry,
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
  }, [poiCategory, activeRoute, originCoord]);

  // ---- Selection + recents ----
  const recordRecent = (place: SearchResult) => {
    addRecent(place);
    setRecents(getRecents());
  };

  const handleSelectDestination = (r: SearchResult) => {
    setDestination(r);
    setDestinationQuery(r.shortLabel);
    recordRecent(r);
  };

  const handleSelectOrigin = (r: SearchResult) => {
    setOriginPlace(r);
    setOriginQuery(r.shortLabel);
    setOriginEditing(false);
    recordRecent(r);
  };

  const handleAddStopSelect = (r: SearchResult) => {
    setStops((s) => [...s, r]);
    setStopQuery("");
    setAdding(false);
    recordRecent(r);
  };

  const handleAddPoiAsStop = (poi: Poi) => {
    setStops((s) => [
      ...s,
      { id: poi.id, label: poi.name, shortLabel: poi.name, lat: poi.lat, lon: poi.lon },
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

  // ---- Home actions ----
  const navigateHome = () => {
    if (!home) {
      toast.message("No Home set yet — search a destination, then tap the star to save it as Home.");
      setOriginEditing(false);
      return;
    }
    setDestination(home);
    setDestinationQuery(home.shortLabel);
    setStops([]);
    setPoiCategory(null);
  };

  const toggleHome = () => {
    if (!destination) {
      toast.message("Pick a destination first, then tap the star to save it as Home.");
      return;
    }
    if (home && home.id === destination.id) {
      persistHome(null);
      setHomeState(null);
      toast.success("Home removed");
    } else {
      persistHome(destination);
      setHomeState(destination);
      toast.success(`Saved Home: ${destination.shortLabel}`);
    }
  };

  // ---- Work actions ----
  const navigateWork = () => {
    if (!work) {
      toast.message("No Work set yet — open Settings to add it.");
      return;
    }
    setDestination(work);
    setDestinationQuery(work.shortLabel);
    setStops([]);
    setPoiCategory(null);
  };

  // ---- Settings menu actions ----
  const handleEditPlace = (kind: "home" | "work") => {
    toast.message(
      `Search a destination, then tap the ${kind === "home" ? "star" : "briefcase"} to save it as ${kind === "home" ? "Home" : "Work"}.`,
      { duration: 4000 },
    );
  };

  const handleClearRecents = () => {
    clearRecents();
    setRecents([]);
    toast.success("Recent searches cleared");
  };

  const handleResetOnboarding = () => {
    setOnboarded(false);
    setOnboarding(true);
    toast.message("Onboarding reset — welcome back!");
  };

  const toggleWork = () => {
    if (!destination) {
      toast.message("Pick a destination first, then tap the briefcase to save it as Work.");
      return;
    }
    if (work && work.id === destination.id) {
      persistWork(null);
      setWorkState(null);
      toast.success("Work removed");
    } else {
      persistWork(destination);
      setWorkState(destination);
      toast.success(`Saved Work: ${destination.shortLabel}`);
    }
  };

  const stopsCoords = useMemo<LngLat[]>(() => stops.map((s) => [s.lon, s.lat]), [stops]);
  const originLabel = originPlace ? originPlace.shortLabel : userPos ? "My location" : "";
  const showOriginField = originEditing || (!userPos && !originPlace);
  const isDestHome = !!(home && destination && home.id === destination.id);
  const isDestWork = !!(work && destination && work.id === destination.id);

  // Bias for searches: prefer GPS, fall back to current origin or destination
  const searchBias: LngLat | null =
    userPos ?? originCoord ?? (destination ? [destination.lon, destination.lat] : null);

  // ---- UI state for the new Maps-style chrome ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<0 | 1 | 2>(1);
  const [hintDismissed, setHintDismissed] = useState(false);

  // Auto-expand the sheet to mid when a route appears, collapse when cleared.
  useEffect(() => {
    if (destination) {
      setSheetSnap(1);
      setSearchOpen(false);
    } else {
      setSheetSnap(0);
    }
  }, [destination]);

  const wrappedClearRoute = () => {
    clearRoute();
    setSheetSnap(0);
  };

  // ---- Live navigation: subscribe to GPS while navigating ----
  useEffect(() => {
    if (!navigating) {
      watchRef.current?.stop();
      watchRef.current = null;
      return;
    }
    let stopped = false;
    setFollowing(true);
    (async () => {
      const w = await watchPosition(
        ({ pos }) => {
          if (stopped) return;
          setUserPos(pos);
        },
        (reason) => {
          if (reason === "denied") {
            toast.error("Location permission was revoked. Navigation paused.");
            setNavigating(false);
          }
        },
      );
      if (stopped) {
        w.stop();
      } else {
        watchRef.current = w;
      }
    })();
    return () => {
      stopped = true;
      watchRef.current?.stop();
      watchRef.current = null;
    };
  }, [navigating]);

  // ---- Compute the upcoming step from the active route + live position ----
  const navInfo = useMemo(() => {
    if (!navigating || !activeRoute || !activeRoute.steps?.length || !userPos) return null;
    return findNextStep(activeRoute.steps, activeRoute.geometry, userPos);
  }, [navigating, activeRoute, userPos]);

  // ---- Auto-stop nav when arrived ----
  useEffect(() => {
    if (!navigating || !navInfo) return;
    if (navInfo.remainingKm * 1000 < 25) {
      toast.success("You have arrived!");
      // small delay so the user sees the arrival banner
      const t = setTimeout(() => setNavigating(false), 2500);
      return () => clearTimeout(t);
    }
  }, [navigating, navInfo]);

  const handleStartNav = () => {
    if (!activeRoute) return;
    setNavigating(true);
    setSheetSnap(0); // collapse the sheet so the map fills the screen
  };

  const handleExitNav = () => {
    setNavigating(false);
    setFollowing(false);
    setSheetSnap(1);
  };

  const handleRecenter = () => setFollowing(true);

  return (
    <>
      {splashing && <Splash onDone={() => setSplashing(false)} />}
      {!splashing && onboarding && (
        <Onboarding
          onComplete={({ userPos: pos, home: h, work: w }) => {
            if (pos) {
              setUserPos(pos);
              setGpsBlocked(false);
            }
            if (h) setHomeState(h);
            if (w) setWorkState(w);
            setOnboarding(false);
          }}
        />
      )}
      <main className="relative h-screen w-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-glow" aria-hidden />

      <MapView
        userPos={userPos}
        origin={originCoord}
        destination={destination ? [destination.lon, destination.lat] : null}
        stops={stopsCoords}
        routes={routes}
        activeRouteIdx={activeRouteIdx}
        onSelectRoute={setActiveRouteIdx}
        pois={pois}
        corridor={corridor}
        focusBounds={focusBounds}
        mapStyle={mapStyle}
        followUser={navigating && following}
        followZoom={profile === "walking" ? 18 : 17}
        onUserPan={navigating ? () => setFollowing(false) : undefined}
      />

      {/* === Top: search pill (Google-Maps style) === */}
      {!searchOpen && !destination && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex justify-center px-3 pt-3">
          <div className="glass pointer-events-auto flex h-12 w-full max-w-xl items-center gap-2 rounded-full px-2 pl-5 text-sm text-muted-foreground shadow-elev">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex flex-1 items-center gap-3 text-left transition hover:text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-route">
                <MapPin className="h-3.5 w-3.5 text-primary-foreground" />
              </span>
              <span className="flex-1 truncate">Search Wayflow</span>
            </button>
            <SettingsMenu
              home={home}
              work={work}
              theme={theme}
              mapStyle={mapStyle}
              onEditHome={() => handleEditPlace("home")}
              onEditWork={() => handleEditPlace("work")}
              onClearRecents={handleClearRecents}
              onResetOnboarding={handleResetOnboarding}
              onChangeTheme={handleChangeTheme}
              onChangeMapStyle={handleChangeMapStyle}
            />
          </div>
        </div>
      )}

      {/* === Top: full search panel (when opened or active route) === */}
      {(searchOpen || destination) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[700] flex justify-center px-3 pt-3">
          <div className="pointer-events-auto w-full max-w-xl space-y-2">
            <div className="glass flex items-center gap-2 rounded-2xl p-2">
              <button
                onClick={() => setSearchOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close search"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 space-y-2">
                {/* From */}
                {showOriginField ? (
                  <SearchBox
                    variant="compact"
                    value={originQuery}
                    onChange={setOriginQuery}
                    onSelect={handleSelectOrigin}
                    placeholder={
                      gpsBlocked
                        ? "From — type a starting address"
                        : "From — type an address or use GPS"
                    }
                    autoFocus={!userPos && !originPlace}
                    bias={searchBias}
                    recents={recents}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setOriginEditing(true);
                      setOriginQuery(originPlace?.shortLabel ?? "");
                    }}
                    className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-left transition hover:border-primary/40"
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

                {/* To */}
                <div className="relative">
                  <SearchBox
                    variant="compact"
                    value={destinationQuery}
                    onChange={setDestinationQuery}
                    onSelect={handleSelectDestination}
                    onClear={wrappedClearRoute}
                    placeholder="Where to?"
                    bias={searchBias}
                    recents={recents}
                    home={home}
                    showHomeShortcut
                    onPickHome={navigateHome}
                    autoFocus={searchOpen && !destination}
                  />
                  {destination && (
                    <div className="absolute right-12 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                      <button
                        onClick={toggleWork}
                        title={isDestWork ? "Remove Work" : "Save as Work"}
                        className={cn(
                          "rounded-full p-1.5 transition",
                          isDestWork
                            ? "text-primary"
                            : "text-muted-foreground hover:text-primary",
                        )}
                        aria-label="Save as Work"
                      >
                        <Briefcase
                          className="h-4 w-4"
                          fill={isDestWork ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        onClick={toggleHome}
                        title={isDestHome ? "Remove Home" : "Save as Home"}
                        className={cn(
                          "rounded-full p-1.5 transition",
                          isDestHome
                            ? "text-secondary"
                            : "text-muted-foreground hover:text-secondary",
                        )}
                        aria-label="Save as Home"
                      >
                        <Star
                          className="h-4 w-4"
                          fill={isDestHome ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  )}
                </div>

                {adding && (
                  <SearchBox
                    variant="compact"
                    autoFocus
                    value={stopQuery}
                    onChange={setStopQuery}
                    onSelect={handleAddStopSelect}
                    placeholder="Add a stop along the way…"
                    bias={searchBias}
                    recents={recents}
                  />
                )}
              </div>
            </div>

            {/* Route alternatives picker (only when route active) */}
            {routes.length > 1 && (
              <div className="glass thin-scroll flex gap-2 overflow-x-auto rounded-2xl p-2">
                {routes.map((r, idx) => {
                  const active = idx === activeRouteIdx;
                  return (
                    <button
                      key={`route-${idx}`}
                      onClick={() => setActiveRouteIdx(idx)}
                      className={cn(
                        "flex shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-all",
                        active
                          ? "border-primary/60 bg-primary/15 shadow-glow"
                          : "border-border bg-muted/40 hover:border-primary/40",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {idx === 0 ? "Fastest" : `Alt ${idx}`}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          active
                            ? "bg-gradient-route bg-clip-text text-transparent"
                            : "text-foreground",
                        )}
                      >
                        {fmtDuration(r.duration)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {fmtKm(r.distance)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {routeLoading && (
              <div className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating routes…
              </div>
            )}
          </div>
        </div>
      )}

      {/* === Floating right-side action stack (always visible) === */}
      <div
        className={cn(
          "pointer-events-none absolute right-3 z-[650] flex flex-col gap-2 transition-[top] duration-200",
          // Push lower when search panel / route header is shown so we don't sit on top of it
          (searchOpen || destination) ? "top-44" : "top-20",
          // Hide entirely while live navigating to free the map
          navigating && "hidden",
        )}
      >
        {/* Settings is always reachable here, even with search open or a route active */}
        {(searchOpen || destination) && (
          <div className="pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full">
            <SettingsMenu
              home={home}
              work={work}
              theme={theme}
              mapStyle={mapStyle}
              onEditHome={() => handleEditPlace("home")}
              onEditWork={() => handleEditPlace("work")}
              onClearRecents={handleClearRecents}
              onResetOnboarding={handleResetOnboarding}
              onChangeTheme={handleChangeTheme}
              onChangeMapStyle={handleChangeMapStyle}
            />
          </div>
        )}
        {/* Quick map-style cycle (Google-Maps "Layers") */}
        <button
          onClick={() => {
            const order: MapStyleId[] = ["dark", "light", "streets", "satellite", "terrain"];
            const next = order[(order.indexOf(mapStyle) + 1) % order.length];
            handleChangeMapStyle(next);
            toast.message(`Map: ${next[0].toUpperCase()}${next.slice(1)}`);
          }}
          className="pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:border-accent/50 hover:text-accent"
          aria-label="Cycle map style"
          title="Map layers"
        >
          <Layers className="h-4 w-4" />
        </button>
        <button
          onClick={navigateHome}
          className={cn(
            "pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full transition hover:border-secondary/50",
            home ? "text-secondary" : "text-muted-foreground",
          )}
          aria-label="Navigate home"
          title="Home"
        >
          <HomeIcon className="h-4 w-4" />
        </button>
        <button
          onClick={navigateWork}
          className={cn(
            "pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full transition hover:border-primary/50",
            work ? "text-primary" : "text-muted-foreground",
          )}
          aria-label="Navigate to work"
          title="Work"
        >
          <Briefcase className="h-4 w-4" />
        </button>
        <button
          onClick={() => requestLocation(false)}
          className="pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:border-primary/50 hover:text-primary"
          aria-label="Use my GPS location"
          title="My location"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
        </button>
        {/* Quick directions FAB to home (Google-Maps style) */}
        {home && !destination && (
          <button
            onClick={navigateHome}
            className="pointer-events-auto glass flex h-10 w-10 items-center justify-center rounded-full text-secondary transition hover:border-secondary/50"
            aria-label="Directions home"
            title="Directions home"
          >
            <NavigationIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* === Dismissible hint pill (only when no route + no GPS) === */}
      {!destination && !originCoord && !locating && !hintDismissed && !searchOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[550] flex justify-center px-3">
          <div className="glass pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            <span className="flex-1">
              Location unavailable here. Tap{" "}
              <span className="font-semibold text-foreground">Search Wayflow</span> to type a
              starting address.
            </span>
            <button
              onClick={() => setHintDismissed(true)}
              className="-m-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* === Bottom: draggable trip sheet (only when a route exists and not navigating) === */}
      {activeRoute && !navigating && (
        <DraggableSheet
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          snapPoints={[14, 48, 88]}
          header={
            <TripSummary
              route={activeRoute}
              destination={destination?.shortLabel ?? null}
              stopsCount={stops.length}
              onClearRoute={wrappedClearRoute}
            />
          }
        >
          {/* Travel profile selector (Drive / Walk) */}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setProfile("driving")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all",
                profile === "driving"
                  ? "border-primary/60 bg-primary/15 text-primary shadow-glow"
                  : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Car className="h-4 w-4" />
              Drive
            </button>
            <button
              onClick={() => setProfile("walking")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all",
                profile === "walking"
                  ? "border-secondary/60 bg-secondary/15 text-secondary shadow-glow"
                  : "border-border bg-muted/40 text-muted-foreground hover:border-secondary/40 hover:text-foreground",
              )}
            >
              <Footprints className="h-4 w-4" />
              Walk
            </button>
          </div>

          <TripControls
            route={activeRoute}
            poiCategory={poiCategory}
            pois={pois}
            poiLoading={poiLoading}
            onPickPoi={setPoiCategory}
            onAddStop={() => setAdding((v) => !v)}
            onAddPoiAsStop={handleAddPoiAsStop}
            onStartNav={handleStartNav}
            isNavigating={navigating}
          />
        </DraggableSheet>
      )}

      {/* === Live navigation overlay === */}
      {navigating && activeRoute && (
        <NavigationOverlay
          route={activeRoute}
          profile={profile}
          step={navInfo?.step ?? null}
          distanceToManeuver={navInfo?.distanceToManeuver ?? 0}
          remainingMeters={(navInfo?.remainingKm ?? 0) * 1000}
          remainingSec={navInfo?.remainingSec ?? activeRoute.duration}
          offRouteMeters={navInfo?.offRouteMeters ?? 0}
          following={following}
          onRecenter={handleRecenter}
          onExit={handleExitNav}
        />
      )}

      {/* === Floating "Where to?" FAB when no route, no panel === */}
      {!destination && !searchOpen && (
        <button
          onClick={() => setSearchOpen(true)}
          className="fixed bottom-6 right-3 z-[600] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-route text-primary-foreground shadow-glow transition hover:brightness-110 sm:hidden"
          aria-label="Search"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
      </main>
    </>
  );
};

export default Index;
