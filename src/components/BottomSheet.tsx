import { Fuel, UtensilsCrossed, TreePalm, Navigation, Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Poi, PoiCategory, RouteResult } from "@/lib/navigation";
import { fmtDuration, fmtKm } from "@/lib/navigation";

interface SheetContentProps {
  route: RouteResult | null;
  destination: string | null;
  stopsCount: number;
  poiCategory: PoiCategory | null;
  pois: Poi[];
  poiLoading: boolean;
  onPickPoi: (cat: PoiCategory | null) => void;
  onAddStop: () => void;
  onAddPoiAsStop: (poi: Poi) => void;
  onClearRoute: () => void;
  onStartNav: () => void;
  isNavigating: boolean;
}

const POI_META: Record<
  PoiCategory,
  { label: string; icon: typeof Fuel; iconClass: string }
> = {
  gas: { label: "Gas", icon: Fuel, iconClass: "poi-gas" },
  food: { label: "Food", icon: UtensilsCrossed, iconClass: "poi-food" },
  rest: { label: "Rest", icon: TreePalm, iconClass: "poi-rest" },
};

/** Compact summary row — used as the always-visible header inside DraggableSheet. */
export function TripSummary({
  route,
  destination,
  stopsCount,
  onClearRoute,
}: {
  route: RouteResult | null;
  destination: string | null;
  stopsCount: number;
  onClearRoute: () => void;
}) {
  if (!route) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-base font-semibold text-foreground">
          {destination || "Route"}
          {stopsCount > 0 && (
            <span className="ml-2 rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary">
              +{stopsCount} stop{stopsCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm">
          <span className="bg-gradient-route bg-clip-text text-base font-bold text-transparent">
            {fmtDuration(route.duration)}
          </span>
          <span className="text-muted-foreground">{fmtKm(route.distance)}</span>
        </div>
      </div>
      <button
        onClick={onClearRoute}
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Clear route"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Full controls — POI tabs, results, Start Nav. Renders inside the sheet's scroll body. */
export function TripControls({
  route,
  poiCategory,
  pois,
  poiLoading,
  onPickPoi,
  onAddStop,
  onAddPoiAsStop,
  onStartNav,
  isNavigating,
}: Omit<SheetContentProps, "destination" | "stopsCount" | "onClearRoute">) {
  if (!route) return null;

  return (
    <div className="w-full">
        {/* Forward-flow POI tabs */}
        <div className="mt-2">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            On the way
          </div>
          <div className="flex gap-2">
            {(Object.keys(POI_META) as PoiCategory[]).map((cat) => {
              const meta = POI_META[cat];
              const Icon = meta.icon;
              const active = poiCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onPickPoi(active ? null : cat)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "border-primary/60 bg-primary/15 text-primary shadow-glow"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              );
            })}
            <button
              onClick={onAddStop}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-secondary/50 hover:text-secondary"
              aria-label="Add stop"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* POI results */}
        {poiCategory && (
          <div className="mt-3 rounded-2xl bg-background/40 p-1">
            {poiLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning forward corridor…
              </div>
            ) : pois.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nothing forward-facing within range. Try another category.
              </div>
            ) : (
              pois.map((p) => {
                const meta = POI_META[p.category];
                const Icon = meta.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => onAddPoiAsStop(p)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                  >
                    <div className={cn("poi-marker !h-9 !w-9", meta.iconClass)}>
                      <Icon className="h-4 w-4 text-background" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium text-foreground">
                        {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        +{fmtKm(p.detourMeters)} detour · {fmtKm(p.forwardKm * 1000)} ahead
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-primary" />
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Start navigation */}
        <button
          onClick={onStartNav}
          className={cn(
            "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold tracking-wide transition-all",
            isNavigating
              ? "bg-muted text-muted-foreground"
              : "bg-gradient-route text-primary-foreground shadow-glow hover:brightness-110",
          )}
        >
          <Navigation className="h-4 w-4" />
          {isNavigating ? "Navigating…" : "Start navigation"}
        </button>
    </div>
  );
}
