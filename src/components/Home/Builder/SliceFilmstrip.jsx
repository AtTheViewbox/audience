import { useEffect, useMemo, useRef, useState } from "react";
import {
  clampSliceRange,
  getIncludedSliceIndices,
  getSliceBounds,
} from "./builderUtils";
import {
  captureViewportThumb,
  getResolvedImageId,
  nearestSampleIndex,
  renderSliceThumb,
  sampleSliceIndices,
} from "./sliceThumbnails";

const THUMB = 64;
const GAP = 2;
const STRIDE = THUMB + GAP;
const EDGE = 28;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pct(index, minIndex, maxIndex) {
  if (maxIndex <= minIndex) return 0;
  return ((index - minIndex) / (maxIndex - minIndex)) * 100;
}

function panToCropRange(start, end, minIndex, trackW, maxPan) {
  const left = (start - minIndex) * STRIDE;
  const right = (end - minIndex + 1) * STRIDE;
  return clamp((left + right) / 2 - trackW / 2, 0, maxPan);
}

export default function SliceFilmstrip({ metadata, onChange, captureRootRef }) {
  const cropRef = useRef(null);
  const selectRef = useRef(null);
  const dragRef = useRef(null);
  const pointerRef = useRef(null);
  const valuesRef = useRef({});
  const capturesRef = useRef(new Map());
  const panRef = useRef(0);
  const [thumbs, setThumbs] = useState({});
  const [captures, setCaptures] = useState({});
  const [pan, setPan] = useState(0);
  const [trackW, setTrackW] = useState(0);
  const [hoverIndex, setHoverIndex] = useState(null);

  const bounds = getSliceBounds(metadata);
  const { minIndex, maxIndex, count } = bounds;
  const clamped = clampSliceRange(metadata, bounds);
  const { start_slice: start, end_slice: end, ci, excluded_slices: excluded } = clamped;
  const included = useMemo(
    () => getIncludedSliceIndices(metadata, bounds),
    [metadata, bounds.minIndex, bounds.maxIndex, start, end, excluded.join(",")]
  );
  const selected = included.length;
  const isCropped = start > minIndex || end < maxIndex || excluded.length > 0;
  const frames = useMemo(() => {
    const all = [];
    for (let i = minIndex; i <= maxIndex; i++) all.push(i);
    return all;
  }, [minIndex, maxIndex]);
  const samples = useMemo(
    () => sampleSliceIndices(count, Math.min(48, Math.max(count, 8))),
    [count]
  );
  const stripW = count * STRIDE;
  const maxPan = Math.max(0, stripW - Math.max(trackW, 1));
  panRef.current = pan;

  valuesRef.current = {
    start,
    end,
    ci,
    minIndex,
    maxIndex,
    bounds,
    metadata,
    included,
    excluded,
    pan,
    maxPan,
    trackW,
  };

  const commit = (next) => {
    onChange(clampSliceRange({ ...valuesRef.current.metadata, ...next }, bounds));
  };

  const indexFromCropX = (clientX) => {
    const el = cropRef.current;
    if (!el) return minIndex;
    const rect = el.getBoundingClientRect();
    const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    const { minIndex: min, maxIndex: max } = valuesRef.current;
    return clamp(Math.round(min + t * (max - min)), min, max);
  };

  const indexFromSelectX = (clientX) => {
    const el = selectRef.current;
    if (!el) return minIndex;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + panRef.current;
    return clamp(minIndex + Math.floor(x / STRIDE), minIndex, maxIndex);
  };

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const measure = () => setTrackW(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPan(0);
    panRef.current = 0;
  }, [metadata?.id]);

  useEffect(() => {
    if (!trackW) return;
    if (pointerRef.current?.source === "select") return;
    if (start === minIndex && end === maxIndex) return;
    const next = panToCropRange(start, end, minIndex, trackW, maxPan);
    panRef.current = next;
    setPan(next);
  }, [start, end, minIndex, maxIndex, trackW, maxPan]);

  useEffect(() => {
    let cancelled = false;
    const visibleStart = minIndex + Math.floor(pan / STRIDE) - 4;
    const visibleEnd = minIndex + Math.ceil((pan + trackW) / STRIDE) + 4;
    const nearby = frames.filter((i) => i >= visibleStart && i <= visibleEnd);
    const toLoad = [...new Set([...nearby, ...included, ...samples])];
    const delay = window.setTimeout(async () => {
      let cursor = 0;
      const loadOne = async () => {
        while (cursor < toLoad.length) {
          const index = toLoad[cursor];
          cursor += 1;
          const imageId = getResolvedImageId(metadata, index);
          if (!imageId) continue;
          try {
            const url = await renderSliceThumb(imageId, { size: 96 });
            if (cancelled || !url) continue;
            setThumbs((prev) => (prev[index] === url ? prev : { ...prev, [index]: url }));
          } catch {
            /* placeholder is fine */
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, toLoad.length) }, loadOne));
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(delay);
    };
  }, [metadata?.id, metadata?.localBlobUrls, metadata?.prefix, included, samples, frames, pan, trackW, minIndex]);

  useEffect(() => {
    let frame = 0;
    const grab = () => {
      const url = captureViewportThumb(captureRootRef?.current, 128);
      if (!url) return;
      capturesRef.current.set(ci, url);
      setCaptures((prev) => (prev[ci] === url ? prev : { ...prev, [ci]: url }));
    };
    frame = requestAnimationFrame(() => requestAnimationFrame(grab));
    return () => cancelAnimationFrame(frame);
  }, [ci, captureRootRef, metadata?.id]);

  useEffect(() => {
    const onMove = (e) => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      const which = dragRef.current;
      const { start: s, end: en, excluded: ex, included: keep } = valuesRef.current;

      if (pointer.source === "select") {
        if (!pointer.moved && Math.abs(e.clientX - pointer.x) > 6) {
          pointer.moved = true;
          dragRef.current = "pan";
        }
        if (!pointer.moved) {
          setHoverIndex(indexFromSelectX(e.clientX));
          return;
        }
        if (dragRef.current === "pan") {
          const nextPan = clamp(pointer.pan0 - (e.clientX - pointer.x), 0, valuesRef.current.maxPan);
          panRef.current = nextPan;
          setPan(nextPan);
          setHoverIndex(indexFromSelectX(e.clientX));
        }
        return;
      }

      if (!which) return;
      const cropEl = cropRef.current;
      if ((which === "start" || which === "end") && cropEl) {
        const rect = cropEl.getBoundingClientRect();
        if (e.clientX < rect.left + EDGE) {
          const nextPan = clamp(panRef.current - 14, 0, valuesRef.current.maxPan);
          panRef.current = nextPan;
          setPan(nextPan);
        } else if (e.clientX > rect.right - EDGE) {
          const nextPan = clamp(panRef.current + 14, 0, valuesRef.current.maxPan);
          panRef.current = nextPan;
          setPan(nextPan);
        }
      }

      const i = indexFromCropX(e.clientX);
      if (which === "start") {
        commit({ start_slice: Math.min(i, en), end_slice: en, ci: Math.min(i, en), excluded_slices: ex });
      } else if (which === "end") {
        commit({ start_slice: s, end_slice: Math.max(i, s), ci: Math.max(i, s), excluded_slices: ex });
      } else if (which === "current") {
        commit({
          start_slice: s,
          end_slice: en,
          ci: Math.min(en, Math.max(s, i)),
          excluded_slices: ex,
        });
      }
    };

    const onUp = () => {
      const pointer = pointerRef.current;
      const { start: s, end: en, excluded: ex, included: keep } = valuesRef.current;
      if (
        pointer?.source === "select" &&
        !pointer.moved &&
        pointer.index != null
      ) {
        const index = pointer.index;
        if (index < s || index > en) {
          commit({
            start_slice: Math.min(s, index),
            end_slice: Math.max(en, index),
            ci: index,
            excluded_slices: (ex || []).filter((i) => i !== index),
          });
        } else if (keep.length > 1) {
          const isOut = (ex || []).includes(index);
          const nextExcluded = isOut
            ? (ex || []).filter((i) => i !== index)
            : [...new Set([...(ex || []), index])];
          const nextKeep = keep.filter((i) => isOut || i !== index);
          const currentCi = valuesRef.current.ci;
          const nextCi = isOut
            ? index
            : (index === currentCi
              ? nextKeep.reduce((best, i) => (Math.abs(i - index) < Math.abs(best - index) ? i : best), nextKeep[0])
              : currentCi);
          commit({
            start_slice: s,
            end_slice: en,
            ci: nextCi,
            excluded_slices: nextExcluded,
          });
        }
      }
      dragRef.current = null;
      pointerRef.current = null;
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

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setPan((p) => {
        const n = clamp(p + delta, 0, valuesRef.current.maxPan);
        panRef.current = n;
        return n;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const beginCropDrag = (which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    pointerRef.current = { source: "crop", x: e.clientX, moved: true, index: null };
  };

  const showAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPan(0);
    commit({
      start_slice: minIndex,
      end_slice: maxIndex,
      excluded_slices: [],
      ci,
    });
  };

  const srcFor = (index) =>
    captures[index] ||
    capturesRef.current.get(index) ||
    thumbs[index] ||
    thumbs[nearestSampleIndex(index, samples)];

  const startPct = pct(start, minIndex, maxIndex);
  const endPct = pct(end, minIndex, maxIndex);
  const ciPct = pct(ci, minIndex, maxIndex);
  const handleNudge = start === end ? 6 : 0;

  return (
    <div className="select-none space-y-1.5">
      <div
        ref={cropRef}
        className="relative h-11 cursor-ew-resize touch-none overflow-hidden rounded-md bg-zinc-950 ring-1 ring-border"
        onPointerDown={(e) => {
          if (e.target.closest?.("button")) return;
          const i = indexFromCropX(e.clientX);
          commit({
            start_slice: start,
            end_slice: end,
            ci: Math.min(end, Math.max(start, i)),
            excluded_slices: excluded,
          });
          dragRef.current = "current";
          pointerRef.current = { source: "crop", x: e.clientX, moved: true, index: i };
        }}
      >
        <div className="absolute inset-0 flex" data-film="true">
          {samples.map((index, slot) => {
            const src = srcFor(index);
            const next = samples[slot + 1] ?? maxIndex + 1;
            const width = ((Math.min(next, maxIndex + 1) - index) / Math.max(count, 1)) * 100;
            return (
              <div
                key={index}
                className="relative h-full overflow-hidden border-r border-black/50"
                style={{ width: `${width}%` }}
              >
                {src ? (
                  <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_100%)]" />
                )}
              </div>
            );
          })}
        </div>

        <div className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none" style={{ width: `${startPct}%` }} />
        <div
          className="absolute inset-y-0 bg-black/60 pointer-events-none"
          style={{ left: `${endPct}%`, width: `${Math.max(0, 100 - endPct)}%` }}
        />
        <div
          className="absolute inset-y-0 border-y-2 border-white pointer-events-none"
          style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0.8)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 z-20 w-0.5 -translate-x-1/2 bg-amber-400 pointer-events-none"
          style={{ left: `${ciPct}%` }}
        />

        <button
          type="button"
          aria-label="In point"
          title={`In ${start + 1}`}
          className="absolute inset-y-0 z-40 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
          style={{ left: `calc(${startPct}% - ${handleNudge}px)` }}
          onPointerDown={beginCropDrag("start")}
        >
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white shadow" />
          <span className="absolute top-1/2 left-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white shadow" />
        </button>
        <button
          type="button"
          aria-label="Out point"
          title={`Out ${end + 1}`}
          className="absolute inset-y-0 z-40 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
          style={{ left: `calc(${endPct}% + ${handleNudge}px)` }}
          onPointerDown={beginCropDrag("end")}
        >
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white shadow" />
          <span className="absolute top-1/2 left-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white shadow" />
        </button>
      </div>

      <div
        ref={selectRef}
        className="relative h-[72px] cursor-grab touch-none overflow-hidden rounded-md bg-zinc-950 ring-1 ring-border active:cursor-grabbing"
        onPointerDown={(e) => {
          const i = indexFromSelectX(e.clientX);
          pointerRef.current = { source: "select", x: e.clientX, moved: false, index: i, pan0: pan };
          setHoverIndex(i);
        }}
        onPointerMove={(e) => {
          if (pointerRef.current) return;
          setHoverIndex(indexFromSelectX(e.clientX));
        }}
        onPointerLeave={() => {
          if (!pointerRef.current) setHoverIndex(null);
        }}
      >
        <div
          className="absolute inset-y-0 flex"
          style={{ width: stripW, transform: `translateX(${-pan}px)` }}
        >
          {frames.map((index) => {
            const src = srcFor(index);
            const inRange = index >= start && index <= end;
            const kept = inRange && !(excluded || []).includes(index);
            return (
              <div
                key={index}
                className={`relative h-full shrink-0 overflow-hidden ${kept ? "" : "opacity-40"}`}
                style={{ width: THUMB, marginRight: GAP }}
              >
                {src ? (
                  <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_100%)]" />
                )}
                {index === ci && (
                  <div className="absolute inset-0 z-10 pointer-events-none border-[3px] border-amber-400 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)]" />
                )}
                {index === hoverIndex && index !== ci && (
                  <div className="absolute inset-0 z-10 pointer-events-none border-2 border-white/70" />
                )}
                <div
                  className={`absolute bottom-1 right-1 z-20 h-3.5 w-3.5 rounded-full border ${
                    kept ? "border-white bg-amber-400" : "border-white/70 bg-black/50"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>In {start + 1}</span>
        <span className="flex items-center gap-2">
          <span className="text-amber-500">{ci + 1}</span>
          <span>{selected} selected</span>
          {isCropped && (
            <button
              type="button"
              onClick={showAll}
              className="rounded px-1 py-0.5 text-foreground/70 hover:bg-accent hover:text-foreground"
            >
              Show all
            </button>
          )}
        </span>
        <span>Out {end + 1}</span>
      </div>
    </div>
  );
}
