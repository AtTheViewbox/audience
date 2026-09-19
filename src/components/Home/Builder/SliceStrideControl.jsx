import { allSlicesDeselected, detectKeepStride, excludedSlicesForStride } from "./builderUtils";

const STEPS = [
  { step: 1, label: "All", title: "Keep every slice" },
  { step: 2, label: "2nd", title: "Keep every other slice" },
  { step: 3, label: "3rd", title: "Keep every third slice" },
  { step: 4, label: "4th", title: "Keep every fourth slice" },
  { step: 5, label: "5th", title: "Keep every fifth slice" },
];

export default function SliceStrideControl({ start, end, excluded, onSelect, onDeselectAll }) {
  const active = detectKeepStride(start, end, excluded);
  const noneSelected = allSlicesDeselected(start, end, excluded);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
        Every
      </span>
      <div className="flex items-center rounded-md border border-border bg-background overflow-hidden">
        {STEPS.map(({ step, label, title }) => {
          const on = active === step;
          return (
            <button
              key={step}
              type="button"
              title={title}
              onClick={() => onSelect?.(excludedSlicesForStride(start, end, step))}
              className={`px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                on
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        title="Uncheck every slice in this crop"
        disabled={noneSelected}
        onClick={() => onDeselectAll?.()}
        className={`rounded-md border px-1.5 py-0.5 text-[10px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
          noneSelected
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        Deselect all
      </button>
    </div>
  );
}
