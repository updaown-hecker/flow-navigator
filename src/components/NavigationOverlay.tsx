import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  CornerUpRight,
  CornerUpLeft,
  Flag,
  X,
  RotateCcw,
  Car,
  Footprints,
  AlertTriangle,
} from "lucide-react";
import { fmtKm, fmtDuration, type RouteResult, type TravelProfile } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface NavigationOverlayProps {
  route: RouteResult;
  profile: TravelProfile;
  /** Current upcoming step (null if not yet computed or arrived). */
  step: { instruction: string; maneuverType: string; maneuverModifier?: string } | null;
  /** Meters until the next maneuver. */
  distanceToManeuver: number;
  /** Remaining distance in meters and ETA in seconds. */
  remainingMeters: number;
  remainingSec: number;
  /** Off-route distance in meters; > ~50 = warn. */
  offRouteMeters: number;
  onRecenter: () => void;
  onExit: () => void;
  /** Whether the map is currently in follow mode. */
  following: boolean;
  /** Optional live speed in km/h (from GPS). */
  speedKmh?: number | null;
}

function maneuverIcon(type: string, modifier?: string) {
  if (type === "arrive") return Flag;
  const m = modifier ?? "";
  if (m.includes("sharp left") || m === "left" || m === "slight left") {
    return m.startsWith("slight") ? ArrowUpLeft : CornerUpLeft;
  }
  if (m.includes("sharp right") || m === "right" || m === "slight right") {
    return m.startsWith("slight") ? ArrowUpRight : CornerUpRight;
  }
  if (m === "uturn") return RotateCcw;
  return ArrowUp;
}

export function NavigationOverlay({
  profile,
  step,
  distanceToManeuver,
  remainingMeters,
  remainingSec,
  offRouteMeters,
  onRecenter,
  onExit,
  following,
  speedKmh,
}: NavigationOverlayProps) {
  const Icon = step ? maneuverIcon(step.maneuverType, step.maneuverModifier) : Flag;
  const arrived = !step || step.maneuverType === "arrive" || remainingMeters < 25;
  const offRoute = offRouteMeters > 60;
  const showSpeed = !arrived && typeof speedKmh === "number" && speedKmh >= 0;

  return (
    <>
      {/* === Top maneuver banner === */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[800] flex justify-center px-2 pt-2">
        <div className="glass pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl p-2 shadow-elev">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              "bg-gradient-route text-primary-foreground shadow-glow",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            {!arrived && (
              <div className="text-base font-bold leading-tight text-foreground">
                {fmtKm(distanceToManeuver)}
              </div>
            )}
            <div
              className={cn(
                "line-clamp-1 text-xs leading-snug",
                arrived ? "text-sm font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {arrived ? "You have arrived" : step?.instruction}
            </div>
          </div>
          <button
            onClick={onExit}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Exit navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Off-route warning */}
      {offRoute && !arrived && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[750] flex justify-center px-3">
          <div className="glass pointer-events-auto flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            You appear to be off-route ({fmtKm(offRouteMeters)})
          </div>
        </div>
      )}

      {/* === Recenter button (only when user has panned away) === */}
      {!following && (
        <button
          onClick={onRecenter}
          className="absolute right-3 top-20 z-[750] flex h-11 w-11 items-center justify-center rounded-full bg-gradient-route text-primary-foreground shadow-glow transition hover:brightness-110"
          aria-label="Recenter on me"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      {/* === Bottom ETA bar === */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[800] flex justify-center px-2 pb-2">
        <div className="glass pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl px-3 py-2 shadow-elev">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/40">
            {profile === "walking" ? (
              <Footprints className="h-3.5 w-3.5 text-secondary" />
            ) : (
              <Car className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="bg-gradient-route bg-clip-text text-sm font-bold leading-tight text-transparent">
              {fmtDuration(remainingSec)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {fmtKm(remainingMeters)} remaining
            </div>
          </div>
          <button
            onClick={onExit}
            className="rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/25"
          >
            End
          </button>
        </div>
      </div>
    </>
  );
}
