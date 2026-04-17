import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  Home as HomeIcon,
  Briefcase,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import type { SearchResult } from "@/lib/navigation";

interface SettingsMenuProps {
  home: SearchResult | null;
  work: SearchResult | null;
  onEditHome: () => void;
  onEditWork: () => void;
  onClearRecents: () => void;
  onResetOnboarding: () => void;
}

export function SettingsMenu({
  home,
  work,
  onEditHome,
  onEditWork,
  onClearRecents,
  onResetOnboarding,
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
        danger ? "text-rose-300 hover:text-rose-200" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="line-clamp-1 text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        aria-label="Settings"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <SettingsIcon className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="glass absolute right-0 top-[calc(100%+8px)] z-[1000] w-64 rounded-2xl p-2 animate-fade-in">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saved places
          </div>
          {item(HomeIcon, home ? "Edit Home" : "Set Home", home?.shortLabel, onEditHome)}
          {item(Briefcase, work ? "Edit Work" : "Set Work", work?.shortLabel, onEditWork)}
          <div className="my-1 h-px bg-border" />
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Data
          </div>
          {item(Trash2, "Clear recent searches", undefined, onClearRecents, true)}
          {item(RotateCcw, "Reset onboarding", "Re-run the welcome tour", onResetOnboarding, true)}
        </div>
      )}
    </div>
  );
}
