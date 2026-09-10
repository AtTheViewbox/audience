import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One question per slide with horizontal snap scroll — keeps answer panels compact.
 */
const QuestionSlideCarousel = forwardRef(function QuestionSlideCarousel(
  { slides, className, dotActiveClassName = "bg-blue-500", onIndexChange, compact = false },
  ref
) {
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);
  const count = slides?.length || 0;

  const syncIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || count === 0) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setIndex(Math.min(Math.max(i, 0), count - 1));
  }, [count]);

  const scrollTo = useCallback(
    (i) => {
      const el = scrollRef.current;
      if (!el || count === 0) return;
      const next = Math.min(Math.max(i, 0), count - 1);
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
      setIndex(next);
    },
    [count]
  );

  useImperativeHandle(ref, () => ({ index, count, scrollTo }), [index, count, scrollTo]);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(count - 1);
  }, [count, index]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useLayoutEffect(() => {
    syncIndexFromScroll();
  }, [count, syncIndexFromScroll]);

  if (count === 0) return null;

  const showNav = count > 1;

  return (
    <div className={cn(compact ? "flex flex-col min-w-0" : "flex flex-col min-h-0 min-w-0", className)}>
      {showNav && (
        <div className="shrink-0 flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] tabular-nums text-slate-400">
            Question {index + 1} of {count}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => scrollTo(index - 1)}
              disabled={index === 0}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous question"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(index + 1)}
              disabled={index >= count - 1}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next question"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={syncIndexFromScroll}
        className={cn(
          compact ? "flex w-full min-w-0 overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" : "flex-1 min-h-0 min-w-0 flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          !showNav && !compact && "overflow-y-auto overscroll-contain"
        )}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className={cn(
              "min-h-0 min-w-0 overflow-y-auto overscroll-contain break-words [overflow-wrap:anywhere]",
              showNav ? "min-w-full w-full shrink-0 snap-start snap-always pr-0.5" : "w-full",
            )}
          >
            {slide}
          </div>
        ))}
      </div>

      {showNav && (
        <div className="shrink-0 flex justify-center gap-1 pt-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Go to question ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? cn("w-4", dotActiveClassName) : "w-1.5 bg-slate-600 hover:bg-slate-500"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default QuestionSlideCarousel;
