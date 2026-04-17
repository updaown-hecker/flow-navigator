import { useEffect, useState } from "react";
import { Compass } from "lucide-react";

interface SplashProps {
  duration?: number;
  onDone: () => void;
}

export function Splash({ duration = 1300, onDone }: SplashProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), duration);
    const t2 = setTimeout(onDone, duration + 380);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration, onDone]);

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center bg-background transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden={leaving}
    >
      {/* radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow" />
      {/* slow rotating gradient ring */}
      <div className="pointer-events-none absolute h-[420px] w-[420px] animate-[spin_8s_linear_infinite] rounded-full opacity-50 [background:conic-gradient(from_0deg,transparent_0deg,hsl(268_90%_65%)_90deg,hsl(210_100%_60%)_180deg,transparent_270deg)] blur-3xl" />

      <div className="relative flex flex-col items-center gap-5">
        <div
          className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-route shadow-glow"
          style={{ animation: "splash-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <Compass className="h-12 w-12 text-primary-foreground" />
          <span className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-primary/40 [animation:pulse-ring_2s_ease-out_infinite]" />
        </div>
        <div className="text-center">
          <h1
            className="bg-gradient-route bg-clip-text text-3xl font-extrabold tracking-tight text-transparent"
            style={{ animation: "fade-in 0.6s ease-out 0.15s both" }}
          >
            Wayflow
          </h1>
          <p
            className="mt-1 text-xs uppercase tracking-[0.32em] text-muted-foreground"
            style={{ animation: "fade-in 0.6s ease-out 0.3s both" }}
          >
            Forward-flow navigation
          </p>
        </div>
      </div>

      <style>{`
        @keyframes splash-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
