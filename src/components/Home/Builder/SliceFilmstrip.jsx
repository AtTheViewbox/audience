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

const MIN_THUMB = 40;
const MAX_THUMB = 96;
const GAP = 2;
const EDGE = 28;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pct(index, minIndex, maxIndex) {
  if (maxIndex <= minIndex) return 0;
  return ((index - minIndex) / (maxIndex - minIndex)) * 100;
}

function viewAroundCrop(start, end, minIndex, maxIndex) {
  if (start <= minIndex && end >= maxIndex) {
    return { viewMin: minIndex, viewMax: maxIndex };
  }
  const span = Math.max(1, end - start);
  const pad = Math.max(2, Math.round(span * 0.25));
  let viewMin = Math.max(minIndex, start - pad);
  let viewMax = Math.min(maxIndex, end + pad);
  if (viewMin === start && viewMin > minIndex) viewMin -= 1;
  if (viewMax === end && viewMax < maxIndex) viewMax += 1;
  return { viewMin, viewMax };
}

function panToCropRange(start, end, viewMin, trackW, maxPan, stride) {
  const left = (start - viewMin) * stride;
  const right = (end - viewMin + 1) * stride;
  return clamp((left + right) / 2 - trackW / 2, 0, maxPan);
}

function panToIndex(index, viewMin, trackW, maxPan, stride) {
  const center = (index - viewMin + 0.5) * stride;
  return clamp(center - trackW / 2, 0, maxPan);
}

export default function SliceFilmstrip({ metadata, onChange, captureRootRef }) {
  const cropRef = useRef(null);
  const selectRef = useRef(null);
  const dragRef = useRef(null);
  const pointerRef = useRef(null);
  const valuesRef = useRef({});
  const capturesRef = useRef(new Map());
  const panRef = useRef(0);
  const lastExpandRef = useRef(0);
  const edgeRafRef = useRef(0);
  const [thumbs, setThumbs] = useState({});
  const [captures, setCaptures] = useState({});
  const [pan, setPan] = useState(0);
  const [trackW, setTrackW] = useState(0);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [view, setView] = useState({ viewMin: 0, viewMax: 0 });
  const [shiftPick, setShiftPick] = useState(false);
  const paintRangeRef = useRef(null);

  const bounds = getSliceBounds(metadata);
  const { minIndex, maxIndex, count } = bounds;
  const clamped = clampSliceRange(metadata, bounds);
  const { start_slice: start, end_slice: end, ci, excluded_slices: excluded } = clamped;
  const included = useMemo(
    () => getIncludedSliceIndices(metadata, bounds, { allowEmpty: true }),
    [metadata, bounds.minIndex, bounds.maxIndex, start, end, excluded.join(",")]
  );
  const selected = included.length;
  const isCropped = start > minIndex || end < maxIndex || excluded.length > 0;

  const viewMin = clamp(view.viewMin || minIndex, minIndex, maxIndex);
  const viewMax = clamp(Math.max(view.viewMax || maxIndex, viewMin), minIndex, maxIndex);
  const viewCount = viewMax - viewMin + 1;
  const frames = useMemo(() => {
    const all = [];
    for (let i = viewMin; i <= viewMax; i++) all.push(i);
    return all;
  }, [viewMin, viewMax]);
  const samples = useMemo(() => {
    const offsets = sampleSliceIndices(viewCount, Math.min(48, Math.max(viewCount, 8)));
    return offsets.map((offset) => viewMin + offset);
  }, [viewCount, viewMin]);

  const idealThumb = trackW > 0
    ? (trackW - GAP * Math.max(0, viewCount - 1)) / Math.max(viewCount, 1)
    : MIN_THUMB;
  const thumbW = Math.round(clamp(idealThumb, MIN_THUMB, MAX_THUMB));
  const stride = thumbW + GAP;
  const stripW = viewCount * stride;
  const maxPan = Math.max(0, stripW - Math.max(trackW, 1));
  panRef.current = pan;

  valuesRef.current = {
    start,
    end,
    ci,
    minIndex,
    maxIndex,
    viewMin,
    viewMax,
    bounds,
    metadata,
    included,
    excluded,
    pan,
    maxPan,
    trackW,
    thumbW,
    stride,
  };

  const commit = (next) => {
    onChange(clampSliceRange({ ...valuesRef.current.metadata, ...next }, bounds));
  };

  paintRangeRef.current = (from, to, mode) => {
    const { start: s, end: en, excluded: ex, ci: current } = valuesRef.current;
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const nextStart = Math.min(s, a);
    const nextEnd = Math.max(en, b);
    const nextEx = new Set(ex || []);
    if (nextStart < s) {
      for (let i = nextStart; i < s; i++) {
        if (i < a || i > b) nextEx.add(i);
      }
    }
    if (nextEnd > en) {
      for (let i = en + 1; i <= nextEnd; i++) {
        if (i < a || i > b) nextEx.add(i);
      }
    }
    for (let i = a; i <= b; i++) {
      if (mode === "select") nextEx.delete(i);
      else nextEx.add(i);
    }
    commit({
      start_slice: nextStart,
      end_slice: nextEnd,
      ci: current,
      excluded_slices: [...nextEx].filter((i) => i >= nextStart && i <= nextEnd),
    });
  };

  const indexFromCropX = (clientX) => {
    const el = cropRef.current;
    if (!el) return valuesRef.current.viewMin;
    const rect = el.getBoundingClientRect();
    const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    const { viewMin: vmin, viewMax: vmax } = valuesRef.current;
    return clamp(Math.round(vmin + t * (vmax - vmin)), vmin, vmax);
  };

  const indexFromSelectX = (clientX) => {
    const el = selectRef.current;
    if (!el) return valuesRef.current.viewMin;
    const rect = el.getBoundingClientRect();
    const { viewMin: vmin, viewMax: vmax, stride: step } = valuesRef.current;
    const x = clientX - rect.left + panRef.current;
    return clamp(vmin + Math.floor(x / step), vmin, vmax);
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
    setView(viewAroundCrop(start, end, minIndex, maxIndex));
  }, [metadata?.id]);

  useEffect(() => {
    if (pointerRef.current) return;
    setView(viewAroundCrop(start, end, minIndex, maxIndex));
  }, [start, end, minIndex, maxIndex]);

  useEffect(() => {
    if (!trackW) return;
    if (pointerRef.current?.source === "select") return;
    const next = panToCropRange(start, end, viewMin, trackW, maxPan, stride);
    panRef.current = next;
    setPan(next);
  }, [start, end, viewMin, viewMax, trackW, maxPan, stride]);

  useEffect(() => {
    let cancelled = false;
    const visibleStart = viewMin + Math.floor(pan / stride) - 4;
    const visibleEnd = viewMin + Math.ceil((pan + trackW) / stride) + 4;
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
  }, [metadata?.id, metadata?.localBlobUrls, metadata?.prefix, included, samples, frames, pan, trackW, viewMin, stride]);

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
    const stopEdgeScroll = () => {
      if (edgeRafRef.current) {
        cancelAnimationFrame(edgeRafRef.current);
        edgeRafRef.current = 0;
      }
    };

    const scrollPaintTowardEdge = (clientX) => {
      const el = selectRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      let { viewMin: vmin, viewMax: vmax, minIndex: lo, maxIndex: hi, stride: step, maxPan: limit } = valuesRef.current;
      const speed = Math.max(10, step * 0.4);
      if (clientX < rect.left + EDGE) {
        if (panRef.current > 0) {
          const nextPan = clamp(panRef.current - speed, 0, limit);
          panRef.current = nextPan;
          setPan(nextPan);
          return true;
        }
        if (vmin > lo) {
          vmin = Math.max(lo, vmin - 1);
          valuesRef.current.viewMin = vmin;
          setView({ viewMin: vmin, viewMax: vmax });
          return true;
        }
      } else if (clientX > rect.right - EDGE) {
        if (panRef.current < limit) {
          const nextPan = clamp(panRef.current + speed, 0, limit);
          panRef.current = nextPan;
          setPan(nextPan);
          return true;
        }
        if (vmax < hi) {
          vmax = Math.min(hi, vmax + 1);
          valuesRef.current.viewMax = vmax;
          setView({ viewMin: vmin, viewMax: vmax });
          return true;
        }
      }
      return false;
    };

    const runEdgeScroll = () => {
      const pointer = pointerRef.current;
      if (!pointer?.shift) {
        edgeRafRef.current = 0;
        return;
      }
      const clientX = pointer.lastClientX;
      if (clientX != null && scrollPaintTowardEdge(clientX)) {
        const i = indexFromSelectX(clientX);
        pointer.last = i;
        setHoverIndex(i);
        paintRangeRef.current?.(pointer.index, i, pointer.mode);
      }
      edgeRafRef.current = requestAnimationFrame(runEdgeScroll);
    };

    const onMove = (e) => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      const which = dragRef.current;
      const { start: s, end: en, excluded: ex, included: keep, minIndex: vminBound, maxIndex: vmaxBound } = valuesRef.current;

      if (pointer.source === "select") {
        if (pointer.shift) {
          pointer.moved = true;
          pointer.lastClientX = e.clientX;
          if (!edgeRafRef.current) {
            edgeRafRef.current = requestAnimationFrame(runEdgeScroll);
          }
          const i = indexFromSelectX(e.clientX);
          pointer.last = i;
          setHoverIndex(i);
          paintRangeRef.current?.(pointer.index, i, pointer.mode);
          return;
        }
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
      let { viewMin: vmin, viewMax: vmax } = valuesRef.current;
      if ((which === "start" || which === "end") && cropEl) {
        const rect = cropEl.getBoundingClientRect();
        const now = Date.now();
        if (now - lastExpandRef.current > 40) {
          if (e.clientX < rect.left + EDGE && vmin > vminBound) {
            vmin = Math.max(vminBound, vmin - 1);
            lastExpandRef.current = now;
          } else if (e.clientX > rect.right - EDGE && vmax < vmaxBound) {
            vmax = Math.min(vmaxBound, vmax + 1);
            lastExpandRef.current = now;
          }
          if (vmin !== valuesRef.current.viewMin || vmax !== valuesRef.current.viewMax) {
            valuesRef.current.viewMin = vmin;
            valuesRef.current.viewMax = vmax;
            setView({ viewMin: vmin, viewMax: vmax });
          }
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
      stopEdgeScroll();
      const pointer = pointerRef.current;
      const { start: s, end: en, excluded: ex, included: keep, minIndex: lo, maxIndex: hi } = valuesRef.current;
      if (pointer?.source === "select" && pointer.shift && pointer.index != null) {
        paintRangeRef.current?.(pointer.index, pointer.last ?? pointer.index, pointer.mode);
        dragRef.current = null;
        pointerRef.current = null;
        return;
      }
      if (
        pointer?.source === "select" &&
        !pointer.moved &&
        pointer.index != null
      ) {
        const index = pointer.index;
        if (index < s || index > en) {
          const nextStart = Math.min(s, index);
          const nextEnd = Math.max(en, index);
          commit({
            start_slice: nextStart,
            end_slice: nextEnd,
            ci: index,
            excluded_slices: (ex || []).filter((i) => i !== index),
          });
          setView(viewAroundCrop(nextStart, nextEnd, lo, hi));
        } else if (index >= s && index <= en) {
          const isOut = (ex || []).includes(index);
          const nextExcluded = isOut
            ? (ex || []).filter((i) => i !== index)
            : [...new Set([...(ex || []), index])];
          const nextKeep = [];
          for (let i = s; i <= en; i++) {
            if (!nextExcluded.includes(i)) nextKeep.push(i);
          }
          const currentCi = valuesRef.current.ci;
          const nextCi = isOut
            ? index
            : (nextKeep.length
              ? (index === currentCi
                ? nextKeep.reduce((best, i) => (Math.abs(i - index) < Math.abs(best - index) ? i : best), nextKeep[0])
                : currentCi)
              : currentCi);
          commit({
            start_slice: s,
            end_slice: en,
            ci: nextCi,
            excluded_slices: nextExcluded,
          });
        }
      } else if (pointer?.source === "crop") {
        setView(viewAroundCrop(valuesRef.current.start, valuesRef.current.end, lo, hi));
      }
      dragRef.current = null;
      pointerRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      stopEdgeScroll();
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      e.preventDefault();
      const { ci: current, viewMin: vmin, trackW: width, maxPan: limit, stride: step } = valuesRef.current;
      const next = panToIndex(current, vmin, width, limit, step);
      panRef.current = next;
      setPan(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const syncShift = (e) => setShiftPick(!!e.shiftKey);
    const clearShift = () => setShiftPick(false);
    window.addEventListener("keydown", syncShift);
    window.addEventListener("keyup", syncShift);
    window.addEventListener("blur", clearShift);
    return () => {
      window.removeEventListener("keydown", syncShift);
      window.removeEventListener("keyup", syncShift);
      window.removeEventListener("blur", clearShift);
    };
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
    setView({ viewMin: minIndex, viewMax: maxIndex });
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

  const startPct = pct(start, viewMin, viewMax);
  const endPct = pct(end, viewMin, viewMax);
  const ciPct = pct(ci, viewMin, viewMax);
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
            const next = samples[slot + 1] ?? viewMax + 1;
            const width = ((Math.min(next, viewMax + 1) - index) / Math.max(viewCount, 1)) * 100;
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
        className={`relative h-[72px] touch-none overflow-hidden rounded-md bg-zinc-950 ring-1 ring-border ${
          shiftPick ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        }`}
        onPointerDown={(e) => {
          const i = indexFromSelectX(e.clientX);
          const kept = i >= start && i <= end && !(excluded || []).includes(i);
          pointerRef.current = {
            source: "select",
            x: e.clientX,
            moved: false,
            index: i,
            last: i,
            pan0: pan,
            shift: e.shiftKey,
            mode: kept ? "deselect" : "select",
          };
          if (e.shiftKey) dragRef.current = "paint";
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
                style={{ width: thumbW, marginRight: GAP }}
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
