import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

function Leaderboard({ entries, mode = "participation", highlightUserId, compact = false }) {
  if (!entries?.length) return null;

  const formatScore = (entry) => {
    const pts = mode === "mcq" ? entry.score : entry.answered;
    return `${pts} pt${pts !== 1 ? "s" : ""}`;
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-700 bg-slate-800/40",
        compact ? "p-2.5" : "p-3"
      )}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Trophy className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-medium text-slate-300">Leaderboard</span>
      </div>
      <div className="space-y-1">
        {entries.map((entry, i) => {
          const isYou = highlightUserId && entry.userId === highlightUserId;
          const rank = i + 1;
          const label = formatScore(entry);

          return (
            <div
              key={entry.userId}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs",
                isYou ? "bg-blue-500/15 border border-blue-500/30" : "bg-slate-900/50"
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    rank === 1
                      ? "bg-amber-500/20 text-amber-300"
                      : rank === 2
                        ? "bg-slate-500/30 text-slate-300"
                        : rank === 3
                          ? "bg-orange-500/15 text-orange-300"
                          : "bg-slate-700 text-slate-400"
                  )}
                >
                  {rank}
                </span>
                <span className={cn("truncate", isYou ? "text-blue-200 font-medium" : "text-slate-200")}>
                  {entry.userName}
                  {isYou && <span className="text-slate-500 font-normal"> (you)</span>}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Leaderboard;
