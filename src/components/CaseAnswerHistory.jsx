import { useCallback, useEffect, useState } from "react";
import { History, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { caseKeyFromLink } from "../lib/answerKeyCase.js";
import { isDemoMode } from "../lib/demoCase.js";
import { fetchCaseSubmissions, clearCaseSubmissions } from "../lib/sessionSubmissions.js";
import { isMcqQuestion, formatMcqAnswer } from "../lib/questionTypes.js";
import { formatMcqAnswerLabel } from "../lib/leaderboard.js";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function SubmissionAnswers({ row, questions }) {
  const answers = row.answers || {};
  const boxCount = Array.isArray(row.boxes) ? row.boxes.length : 0;

  if (!questions?.length && !boxCount) {
    return <p className="text-xs text-muted-foreground">No answers stored.</p>;
  }

  return (
    <ul className="space-y-1">
      {(questions || []).map((q, idx) => {
        const ans = answers[q.id];
        let given = "—";
        let correct = null;
        if (isMcqQuestion(q)) {
          if (ans?.selectedIndex != null) {
            given = formatMcqAnswerLabel(q, ans.selectedIndex);
            correct = given === formatMcqAnswer(q);
          }
        } else if (ans?.text) {
          given = ans.text;
        }
        return (
          <li key={q.id} className="text-xs min-w-0">
            <span className="text-muted-foreground">{idx + 1}. </span>
            <span
              className={
                correct === true
                  ? "text-emerald-600 dark:text-emerald-400"
                  : correct === false
                    ? "text-red-500"
                    : "break-words [overflow-wrap:anywhere]"
              }
            >
              {given}
            </span>
          </li>
        );
      })}
      {boxCount > 0 && (
        <li className="text-xs text-muted-foreground">
          {boxCount} drawn box{boxCount === 1 ? "" : "es"}
        </li>
      )}
    </ul>
  );
}

export default function CaseAnswerHistory({
  supabaseClient,
  userId,
  studyId,
  caseLink,
  questions,
  onCleared,
}) {
  const [isOwner, setIsOwner] = useState(false);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const caseKey = caseKeyFromLink(caseLink || { studyId });
  const canShow = !isDemoMode() && !!studyId && !!userId && !!caseKey;

  const load = useCallback(async () => {
    if (!canShow || !supabaseClient) return;
    try {
      const [studyRes, submissions] = await Promise.all([
        supabaseClient.from("studies").select("owner").eq("id", studyId).maybeSingle(),
        fetchCaseSubmissions(supabaseClient, caseKey),
      ]);
      setIsOwner(studyRes.data?.owner === userId);
      setRows(submissions);
    } catch (e) {
      console.error("Failed to load case answer history:", e);
    }
  }, [canShow, supabaseClient, studyId, userId, caseKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canShow || !isOwner) return null;

  const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setBusy(true);
    try {
      const deleted = await clearCaseSubmissions(supabaseClient, caseKey);
      if (!deleted.length && rows.length) {
        toast.error("Could not clear history");
        return;
      }
      setRows([]);
      setOpen(false);
      setConfirmClear(false);
      toast.success("Answer history cleared");
      onCleared?.();
    } catch (e) {
      console.error("Failed to clear case history:", e);
      toast.error(e?.message || "Failed to clear history");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Answer history
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rows.length === 0
              ? "No submissions yet for this case."
              : `${rows.length} submission${rows.length === 1 ? "" : "s"}${sessions ? ` · ${sessions} session${sessions === 1 ? "" : "s"}` : ""}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={rows.length === 0}
            onClick={() => {
              setOpen((v) => !v);
              setConfirmClear(false);
            }}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
            Review
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs text-red-500 hover:text-red-600"
            disabled={rows.length === 0 || busy}
            onClick={handleClear}
            onBlur={() => setConfirmClear(false)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {confirmClear ? "Confirm" : "Clear"}
          </Button>
        </div>
      </div>

      {open && rows.length > 0 && (
        <div className="max-h-44 overflow-y-auto overscroll-contain space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-slate-200 dark:border-slate-800 px-2 py-1.5 space-y-1"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium truncate">{row.user_name || "Anonymous"}</p>
                <p className="text-[10px] text-muted-foreground shrink-0">{formatWhen(row.updated_at)}</p>
              </div>
              <SubmissionAnswers row={row} questions={questions} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
