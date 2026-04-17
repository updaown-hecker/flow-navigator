import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import type { SearchResult } from "@/lib/navigation";
import { searchPlaces } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: SearchResult) => void;
  onClear?: () => void;
  variant?: "primary" | "compact";
  autoFocus?: boolean;
}

export function SearchBox({
  placeholder = "Where to?",
  value,
  onChange,
  onSelect,
  onClear,
  variant = "primary",
  autoFocus,
}: SearchBoxProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (value.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(value, ctl.signal);
        if (!ctl.signal.aborted) {
          setResults(r);
          setOpen(true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value]);

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
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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

      {open && results.length > 0 && (
        <div className="glass thin-scroll absolute left-0 right-0 top-[calc(100%+8px)] z-[1000] max-h-72 overflow-y-auto rounded-2xl p-2 animate-fade-in">
          {results.map((r) => (
            <button
              key={r.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
            >
              <span className="text-sm font-medium text-foreground">{r.shortLabel}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
