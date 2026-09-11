import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { clampSliceRange, getSliceBounds } from "./builderUtils";

function toIndex(display, minIndex) {
  const n = Number(display);
  if (!Number.isFinite(n)) return minIndex;
  return Math.round(n) - 1 + minIndex;
}

function pct(index, minIndex, maxIndex) {
  if (maxIndex <= minIndex) return 0;
  return ((index - minIndex) / (maxIndex - minIndex)) * 100;
}

export default function SliceRangeSlider({ metadata, onChange, compact = false }) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const valuesRef = useRef({});

  const bounds = getSliceBounds(metadata);
  const { minIndex, maxIndex, count } = bounds;
  const { start_slice: start, end_slice: end, ci } = clampSliceRange(metadata, bounds);
  const selected = end - start + 1;

  valuesRef.current = { start, end, ci, minIndex, maxIndex, bounds, metadata };

  const commit = (next) => {
    onChange(clampSliceRange({ ...valuesRef.current.metadata, ...next }, bounds));
  };

  const indexFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return minIndex;
    const rect = el.getBoundingClientRect();
    const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    const raw = minIndex + t * (maxIndex - minIndex);
    return Math.min(maxIndex, Math.max(minIndex, Math.round(raw)));
  };

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { start: s, end: en } = valuesRef.current;
      const i = indexFromClientX(e.clientX);
      if (drag === "start") {
        commit({ start_slice: Math.min(i, en), end_slice: en });
      } else if (drag === "end") {
        commit({ start_slice: s, end_slice: Math.max(i, s) });
      } else if (drag === "current") {
        commit({ start_slice: s, end_slice: en, ci: Math.min(en, Math.max(s, i)) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const beginDrag = (which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
  };

  const startPct = pct(start, minIndex, maxIndex);
  const endPct = pct(end, minIndex, maxIndex);
  const ciPct = pct(ci, minIndex, maxIndex);
  const handleNudge = start === end ? 7 : 0;

  const track = compact ? "bg-white/25" : "bg-foreground/20";
  const fill = compact ? "bg-white/80" : "bg-foreground/70";
  const knob = "border-white/80 bg-white shadow-sm";
  const numbers = compact ? "text-white/70" : "text-muted-foreground";

  return (
    <div className={compact ? "space-y-1" : "space-y-3"}>
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Slices</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {selected} of {count}
          </span>
        </div>
      )}

      <div className="px-1.5 pt-3">
        <div
          ref={trackRef}
          className="relative h-7"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget && e.target.dataset.track !== "true") return;
            commit({
              start_slice: start,
              end_slice: end,
              ci: Math.min(end, Math.max(start, indexFromClientX(e.clientX))),
            });
            dragRef.current = "current";
          }}
        >
          <div
            data-track="true"
            className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${track}`}
          />
          <div
            data-track="true"
            className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${fill}`}
            style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0.5)}%` }}
          />

          <div
            className={`absolute top-1 bottom-1 z-10 w-px -translate-x-1/2 pointer-events-none ${compact ? "bg-white/80" : "bg-amber-400"}`}
            style={{ left: `${ciPct}%` }}
          />
          <button
            type="button"
            aria-label="Current slice"
            title={`Current ${ci + 1}`}
            className={`absolute z-30 top-0 h-2 w-2 -translate-x-1/2 rounded-sm cursor-ew-resize touch-none ${compact ? "bg-white" : "bg-amber-400"}`}
            style={{ left: `${ciPct}%` }}
            onPointerDown={beginDrag("current")}
          />

          <button
            type="button"
            aria-label="Start slice"
            title={`Start ${start + 1}`}
            className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border cursor-ew-resize touch-none ${knob}`}
            style={{ left: `calc(${startPct}% - ${handleNudge}px)` }}
            onPointerDown={beginDrag("start")}
          />
          <button
            type="button"
            aria-label="End slice"
            title={`End ${end + 1}`}
            className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border cursor-ew-resize touch-none ${knob}`}
            style={{ left: `calc(${endPct}% + ${handleNudge}px)` }}
            onPointerDown={beginDrag("end")}
          />
        </div>

        <div className={`flex justify-between text-[10px] tabular-nums ${numbers}`}>
          <span>{start + 1}</span>
          <span className="text-amber-500">{ci + 1}</span>
          <span>{end + 1}</span>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</span>
            <Input
              type="number"
              min={1}
              max={count}
              value={start + 1}
              className="h-8"
              onChange={(e) => {
                const nextStart = toIndex(e.target.value, minIndex);
                commit({ start_slice: nextStart, end_slice: Math.max(nextStart, end) });
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-amber-500">Current</span>
            <Input
              type="number"
              min={start + 1}
              max={end + 1}
              value={ci + 1}
              className="h-8"
              onChange={(e) => {
                commit({
                  start_slice: start,
                  end_slice: end,
                  ci: toIndex(e.target.value, minIndex),
                });
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">End</span>
            <Input
              type="number"
              min={1}
              max={count}
              value={end + 1}
              className="h-8"
              onChange={(e) => {
                const nextEnd = toIndex(e.target.value, minIndex);
                commit({ start_slice: Math.min(start, nextEnd), end_slice: nextEnd });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
