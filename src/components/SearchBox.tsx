import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Clock, Home as HomeIcon, MapPin } from "lucide-react";
import type { LngLat, SearchResult } from "@/lib/navigation";
import { searchPlaces } from "@/lib/navigation";
import { getCachedSearch, setCachedSearch } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: SearchResult) => void;
  onClear?: () => void;
  variant?: "primary" | "compact";
  autoFocus?: boolean;
  /** GPS or map-center coordinate to bias results toward */
  bias?: LngLat | null;
  /** Recently used places to surface when the input is empty/short */
  recents?: SearchResult[];
  /** Saved Home — shown as a one-tap shortcut when the input is empty */
  home?: SearchResult | null;
  /** Show the Home shortcut row (only relevant on the destination field) */
  showHomeShortcut?: boolean;
  onPickHome?: () => void;
}

export function SearchBox({
  placeholder = "Where to?",
  value,
  onChange,
  onSelect,
  onClear,
  variant = "primary",
  autoFocus,
  bias,
  recents = [],
  home,
  showHomeShortcut,
  onPickHome,
}: SearchBoxProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const biasKey = bias ? `${bias[0].toFixed(1)},${bias[1].toFixed(1)}` : "global";

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // 1. Cache hit — instant
    const cached = getCachedSearch(q, biasKey);
    if (cached) {
      setResults(cached);
      setOpen(true);
      setLoading(false);
      return;
    }

    // 2. Network with debounce
    setLoading(true);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(q, { signal: ctl.signal, bias: bias ?? undefined });
        if (!ctl.signal.aborted) {
          setResults(r);
          setCachedSearch(q, biasKey, r);
          setOpen(true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value, bias, biasKey]);

  const isEmpty = value.trim().length < 2;
  const showShortcuts =
    open && isEmpty && ((showHomeShortcut && home) || recents.length > 0);
  const showResults = open && !isEmpty && results.length > 0;

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "glass flex items-center gap-2 rounded-2xl px-4 transition-all",
          variant === "primary" ? "h-14" : "h-12",
          "focus-within:ring-2 focus-within:ring-primary/60",
        )}
      >
        <Search className="h-5 w-5 shrink-0 text-primary" />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          className="h-full flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {value && !loading && (
          <button
            onClick={() => {
              onChange("");
              onClear?.();
              setResults([]);
            }}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(showShortcuts || showResults) && (
        <div className="glass thin-scroll absolute left-0 right-0 top-[calc(100%+8px)] z-[1000] max-h-80 overflow-y-auto rounded-2xl p-2 animate-fade-in">
          {showShortcuts && (
            <>
              {showHomeShortcut && home && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPickHome?.();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-route">
                    <HomeIcon className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">Home</div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {home.shortLabel}
                    </div>
                  </div>
                </button>
              )}
              {recents.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent
                  </div>
                  {recents.map((r) => (
                    <button
                      key={`recent-${r.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(r);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-primary/10"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-1 text-sm text-foreground">
                          {r.shortLabel}
                        </div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {r.label}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {showResults &&
            results.map((r) => (
              <button
                key={r.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{r.shortLabel}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{r.label}</div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
