import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  MapPin,
  Home as HomeIcon,
  Briefcase,
  Sparkles,
  Check,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Fuel,
  UtensilsCrossed,
  TreePalm,
} from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { getCurrentPosition, type GeoErrorReason } from "@/lib/geo";
import { setHome, setWork, setOnboarded, getRecents } from "@/lib/storage";
import type { LngLat, SearchResult } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface OnboardingProps {
  onComplete: (result: { userPos: LngLat | null; home: SearchResult | null; work: SearchResult | null }) => void;
}

type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [userPos, setUserPos] = useState<LngLat | null>(null);
  const [permState, setPermState] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [permReason, setPermReason] = useState<string>("");

  const [homeQuery, setHomeQuery] = useState("");
  const [home, setHomeLocal] = useState<SearchResult | null>(null);

  const [workQuery, setWorkQuery] = useState("");
  const [work, setWorkLocal] = useState<SearchResult | null>(null);

  const recents = useMemo(() => getRecents(), []);

  const next = () => setStep((s) => (Math.min(TOTAL_STEPS - 1, s + 1) as Step));
  const back = () => setStep((s) => (Math.max(0, s - 1) as Step));

  const finish = () => {
    if (home) setHome(home);
    if (work) setWork(work);
    setOnboarded(true);
    onComplete({ userPos, home, work });
  };

  const requestPermission = async () => {
    setPermState("asking");
    try {
      const { pos } = await getCurrentPosition();
      setUserPos(pos);
      setPermState("granted");
      // Auto-advance after a moment so the success state is visible
      setTimeout(() => next(), 700);
    } catch (err: unknown) {
      const reason = (err as { reason?: GeoErrorReason }).reason ?? "unavailable";
      setPermState("denied");
      setPermReason(
        reason === "denied"
          ? "Location was blocked. You can still use Wayflow by typing a starting address."
          : reason === "unsupported"
            ? "This device doesn't support geolocation."
            : "Couldn't read GPS right now. You can still continue.",
      );
    }
  };

  // Allow Escape on the last step to skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step === TOTAL_STEPS - 1) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, home, work]);

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center overflow-y-auto bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow" aria-hidden />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full opacity-40 blur-3xl [background:radial-gradient(circle,hsl(268_90%_65%/0.4),transparent_60%)]" />

      <div className="glass relative w-full max-w-md rounded-3xl p-6 animate-fade-in sm:p-8">
        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-500",
                i < step
                  ? "bg-primary"
                  : i === step
                    ? "bg-gradient-route"
                    : "bg-muted",
              )}
            />
          ))}
        </div>

        <div key={step} className="animate-fade-in">
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && (
            <PermissionStep
              state={permState}
              reason={permReason}
              onAsk={requestPermission}
              onContinue={next}
            />
          )}
          {step === 2 && (
            <PlaceStep
              icon={HomeIcon}
              title="Set your Home"
              tagline="One-tap navigation home, any time."
              query={homeQuery}
              setQuery={setHomeQuery}
              place={home}
              setPlace={setHomeLocal}
              bias={userPos}
              recents={recents}
              accent="primary"
              placeholder="Enter your home address"
            />
          )}
          {step === 3 && (
            <PlaceStep
              icon={Briefcase}
              title="Set your Work"
              tagline="Optional — quickly route to your office or main spot."
              query={workQuery}
              setQuery={setWorkQuery}
              place={work}
              setPlace={setWorkLocal}
              bias={userPos}
              recents={recents}
              accent="secondary"
              placeholder="Enter your work address"
            />
          )}
          {step === 4 && <TutorialStep />}
        </div>

        {/* Footer nav */}
        <div className="mt-7 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={back}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {step >= 2 && step < TOTAL_STEPS - 1 && (
              <button
                onClick={next}
                className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Skip
              </button>
            )}
            {step === 1 && permState !== "granted" && (
              <button
                onClick={next}
                className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Skip
              </button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <button
                onClick={next}
                disabled={step === 1 && permState === "asking"}
                className="flex items-center gap-1.5 rounded-2xl bg-gradient-route px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-1.5 rounded-2xl bg-gradient-route px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
              >
                Get started
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 0: Welcome ----------
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-route shadow-glow">
        <Compass className="h-10 w-10 text-primary-foreground" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">
        Welcome to Wayflow
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        A sleek, OpenStreetMap-powered navigator with{" "}
        <span className="font-semibold text-primary">forward-flow</span> POI search — never a U-turn
        for gas, food, or a rest stop again.
      </p>
      <ul className="mt-5 space-y-2 text-left">
        {[
          { i: MapPin, t: "Multiple route options at a glance" },
          { i: HomeIcon, t: "One-tap Home & Work shortcuts" },
          { i: Sparkles, t: "Smart search with recent history" },
        ].map(({ i: Icon, t }) => (
          <li
            key={t}
            className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-route">
              <Icon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm text-foreground">{t}</span>
          </li>
        ))}
      </ul>
      <button onClick={onNext} className="sr-only" aria-hidden />
    </div>
  );
}

// ---------- Step 1: Permission ----------
function PermissionStep({
  state,
  reason,
  onAsk,
  onContinue,
}: {
  state: "idle" | "asking" | "granted" | "denied";
  reason: string;
  onAsk: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "mx-auto flex h-20 w-20 items-center justify-center rounded-3xl shadow-glow transition-colors",
          state === "granted"
            ? "bg-gradient-to-br from-emerald-400 to-cyan-400"
            : state === "denied"
              ? "bg-gradient-to-br from-rose-400 to-orange-400"
              : "bg-gradient-route",
        )}
      >
        {state === "granted" ? (
          <Check className="h-10 w-10 text-background" />
        ) : (
          <MapPin className="h-10 w-10 text-primary-foreground" />
        )}
      </div>
      <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">
        Enable location
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Wayflow uses your location as the starting point and to bias address search to nearby
        results. Your position never leaves your device.
      </p>

      <div className="mt-6">
        {state === "idle" && (
          <button
            onClick={onAsk}
            className="w-full rounded-2xl bg-gradient-route py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
          >
            Allow location access
          </button>
        )}
        {state === "asking" && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Requesting permission…
          </div>
        )}
        {state === "granted" && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 py-3 text-sm font-medium text-emerald-300">
            Location granted ✓
          </div>
        )}
        {state === "denied" && (
          <div className="space-y-2">
            <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
              {reason}
            </p>
            <button
              onClick={onAsk}
              className="w-full rounded-2xl border border-border bg-muted/40 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              Try again
            </button>
            <button
              onClick={onContinue}
              className="w-full rounded-2xl py-2.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Continue without GPS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Step 2 & 3: Place picker (Home / Work) ----------
function PlaceStep({
  icon: Icon,
  title,
  tagline,
  query,
  setQuery,
  place,
  setPlace,
  bias,
  recents,
  accent,
  placeholder,
}: {
  icon: typeof HomeIcon;
  title: string;
  tagline: string;
  query: string;
  setQuery: (v: string) => void;
  place: SearchResult | null;
  setPlace: (p: SearchResult | null) => void;
  bias: LngLat | null;
  recents: SearchResult[];
  accent: "primary" | "secondary";
  placeholder: string;
}) {
  return (
    <div>
      <div className="text-center">
        <div
          className={cn(
            "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-glow",
            accent === "primary"
              ? "bg-gradient-route"
              : "bg-gradient-to-br from-amber-400 to-pink-500",
          )}
        >
          <Icon className="h-8 w-8 text-background" />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
      </div>

      <div className="mt-5">
        <SearchBox
          variant="primary"
          value={query}
          onChange={setQuery}
          onSelect={(r) => {
            setPlace(r);
            setQuery(r.shortLabel);
          }}
          onClear={() => setPlace(null)}
          placeholder={placeholder}
          bias={bias}
          recents={recents}
        />
      </div>

      {place && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{place.shortLabel}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">{place.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Step 4: Tutorial ----------
function TutorialStep() {
  const items = [
    {
      Icon: Fuel,
      cls: "from-sky-400 to-cyan-400",
      title: "Gas — only ahead",
      body: "Tap Gas after a route is set. We'll show fuel stations inside your forward corridor — never behind you.",
    },
    {
      Icon: UtensilsCrossed,
      cls: "from-pink-400 to-violet-500",
      title: "Food on the way",
      body: "Restaurants, cafés, and fast food sorted by closest-ahead, ranked with a small detour penalty.",
    },
    {
      Icon: TreePalm,
      cls: "from-emerald-400 to-cyan-400",
      title: "Rest stops",
      body: "Highway rest areas and picnic sites in the next 120 km of your trip.",
    },
  ];
  return (
    <div>
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-route shadow-glow">
          <Sparkles className="h-8 w-8 text-primary-foreground" />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
          Forward-flow POIs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wayflow's superpower — three taps to find what you need on the way.
        </p>
      </div>
      <ul className="mt-5 space-y-2.5">
        {items.map(({ Icon, cls, title, body }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3"
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                cls,
              )}
            >
              <Icon className="h-5 w-5 text-background" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
