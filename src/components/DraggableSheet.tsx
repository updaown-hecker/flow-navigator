import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DraggableSheetProps {
  /** Snap heights in vh from the bottom. e.g. [12, 45, 88] = peek / mid / full */
  snapPoints?: [number, number, number];
  defaultSnap?: 0 | 1 | 2;
  /** Optional controlled snap (e.g. auto-expand when route appears) */
  snap?: 0 | 1 | 2;
  onSnapChange?: (s: 0 | 1 | 2) => void;
  /** Always-visible content above the scroll area (handle row, summary). */
  header: ReactNode;
  /** Scrollable body, only meaningful when sheet is mid/full. */
  children?: ReactNode;
  className?: string;
}

/**
 * Google-Maps-style bottom sheet with three snap points and pointer-driven dragging.
 * The map remains fully interactive whenever the sheet is at its peek/mid heights.
 */
export function DraggableSheet({
  snapPoints = [12, 45, 88],
  defaultSnap = 1,
  snap,
  onSnapChange,
  header,
  children,
  className,
}: DraggableSheetProps) {
  const [internalSnap, setInternalSnap] = useState<0 | 1 | 2>(defaultSnap);
  const current = snap ?? internalSnap;

  const setSnap = useCallback(
    (s: 0 | 1 | 2) => {
      setInternalSnap(s);
      onSnapChange?.(s);
    },
    [onSnapChange],
  );

  // Drag state
  const [dragOffset, setDragOffset] = useState(0); // px, positive = dragged down
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVH = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVH.current = snapPoints[current];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setDragOffset(e.clientY - startY.current);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const vh = window.innerHeight / 100;
    const draggedVH = startVH.current - dragOffset / vh;
    // Snap to nearest
    let nearest: 0 | 1 | 2 = 0;
    let best = Infinity;
    snapPoints.forEach((sp, i) => {
      const d = Math.abs(sp - draggedVH);
      if (d < best) {
        best = d;
        nearest = i as 0 | 1 | 2;
      }
    });
    setDragOffset(0);
    setSnap(nearest);
  };

  // Keyboard a11y on handle
  const onHandleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") setSnap(Math.min(2, current + 1) as 0 | 1 | 2);
    if (e.key === "ArrowDown") setSnap(Math.max(0, current - 1) as 0 | 1 | 2);
  };

  // Compute height
  const baseVH = snapPoints[current];
  const vh = typeof window !== "undefined" ? window.innerHeight / 100 : 8;
  const heightPx = Math.max(60, baseVH * vh - dragOffset);

  // Reset dragOffset if snap changes externally
  useEffect(() => {
    if (!dragging.current) setDragOffset(0);
  }, [snap]);

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-[600] flex flex-col rounded-t-3xl",
        "glass border-b-0",
        !dragging.current && "transition-[height] duration-300 ease-out",
        className,
      )}
      style={{ height: `${heightPx}px` }}
    >
      {/* Drag handle area — captures pointer for the whole header */}
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={current}
        aria-label="Adjust panel height"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onHandleKey}
        onClick={() => {
          // tap on handle cycles peek→mid→full→peek
          if (!dragging.current && Math.abs(dragOffset) < 4) {
            setSnap(((current + 1) % 3) as 0 | 1 | 2);
          }
        }}
        className="shrink-0 cursor-grab touch-none select-none px-4 pt-2 pb-1 active:cursor-grabbing"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-border transition-colors group-hover:bg-primary/60" />
      </div>

      {/* Header (always visible) */}
      <div className="shrink-0 px-4 pb-2">{header}</div>

      {/* Scroll body — only useful at mid/full */}
      {current > 0 && (
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      )}
    </div>
  );
}
