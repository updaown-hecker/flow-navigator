import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  Home as HomeIcon,
  Briefcase,
  Trash2,
  RotateCcw,
  X,
  Palette,
  Map as MapIcon,
  Check,
} from "lucide-react";
import type { SearchResult } from "@/lib/navigation";
import type { AppTheme, MapStyleId } from "@/lib/storage";
import { MAP_STYLE_LIST } from "@/lib/mapStyles";

interface SettingsMenuProps {
  home: SearchResult | null;
  work: SearchResult | null;
  theme: AppTheme;
  mapStyle: MapStyleId;
  onEditHome: () => void;
  onEditWork: () => void;
  onClearRecents: () => void;
  onResetOnboarding: () => void;
  onChangeTheme: (t: AppTheme) => void;
  onChangeMapStyle: (s: MapStyleId) => void;
}

const THEMES: { id: AppTheme; label: string; swatch: string }[] = [
  { id: "dark", label: "Dark", swatch: "linear-gradient(135deg, hsl(224 47% 6%), hsl(210 100% 60%))" },
  { id: "light", label: "Light", swatch: "linear-gradient(135deg, hsl(0 0% 100%), hsl(210 100% 50%))" },
  { id: "midnight", label: "Midnight", swatch: "linear-gradient(135deg, hsl(270 50% 5%), hsl(285 95% 65%))" },
];

export function SettingsMenu({
  home,
  work,
  theme,
  mapStyle,
  onEditHome,
  onEditWork,
  onClearRecents,
  onResetOnboarding,
  onChangeTheme,
  onChangeMapStyle,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (
    Icon: typeof HomeIcon,
    label: string,
    sub: string | undefined,
    onClick: () => void,
    danger = false,
  ) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10 ${
        danger ? "text-rose-400 hover:text-rose-300" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="line-clamp-1 text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );

  const sectionLabel = (Icon: typeof Palette, text: string) => (
    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {text}
    </div>
  );

  return (
    <div className={`relative ${open ? "z-[1200]" : ""}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        aria-label="Settings"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <SettingsIcon className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="glass thin-scroll absolute right-0 top-[calc(100%+8px)] z-[1300] max-h-[80vh] w-72 overflow-y-auto rounded-2xl p-2 animate-fade-in shadow-2xl">
          {sectionLabel(HomeIcon, "Saved places")}
          {item(HomeIcon, home ? "Edit Home" : "Set Home", home?.shortLabel, onEditHome)}
          {item(Briefcase, work ? "Edit Work" : "Set Work", work?.shortLabel, onEditWork)}

          <div className="my-1 h-px bg-border" />
          {sectionLabel(Palette, "App theme")}
          <div className="grid grid-cols-3 gap-1.5 px-2 py-1">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onChangeTheme(t.id)}
                  className={`group flex flex-col items-center gap-1 rounded-xl border p-2 transition ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span
                    className="h-8 w-8 rounded-lg border border-border"
                    style={{ background: t.swatch }}
                  />
                  <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                    {active && <Check className="h-3 w-3 text-primary" />}
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="my-1 h-px bg-border" />
          {sectionLabel(MapIcon, "Map style")}
          <div className="grid grid-cols-1 gap-1 px-1 py-1">
            {MAP_STYLE_LIST.map((s) => {
              const active = mapStyle === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onChangeMapStyle(s.id)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>

          <div className="my-1 h-px bg-border" />
          {sectionLabel(Trash2, "Data")}
          {item(Trash2, "Clear recent searches", undefined, onClearRecents, true)}
          {item(RotateCcw, "Reset onboarding", "Re-run the welcome tour", onResetOnboarding, true)}
        </div>
      )}
    </div>
  );
}
