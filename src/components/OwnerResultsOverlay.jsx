import { useContext, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { BarChart3, X, CheckCircle2, MessageSquare, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

import { DataContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { isCaseLinked, applyQuestionCaseFilter } from "../lib/answerKeyCase.js";
import { isDemoMode, isDemoPresenter, isPresenter, getDemoQuestions } from "../lib/demoCase.js";
import { fetchDemoStats } from "../lib/demoVisits.js";
import { isMcqQuestion, normalizeMcqOptions } from "../lib/questionTypes.js";
import { computeMcqLeaderboard } from "../lib/leaderboard.js";
import { getLeaderboardEnabled, PREF_EVENT } from "../lib/userPreferences.js";
import Leaderboard from "./Leaderboard.jsx";
import QuestionSlideCarousel from "./QuestionSlideCarousel.jsx";

// Temporarily disabled: leaderboard scores aren't reliably persisting across
// session transfers yet. Flip back to true once that's resolved.
const LEADERBOARD_ENABLED = false;

const PANEL_CLASS =
  "dark fixed top-14 right-3 z-[200] w-[min(340px,calc(100vw-1.5rem))] max-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl backdrop-blur-sm";

function OwnerResultsOverlay() {
  const {
    studyId,
    dicomSeriesId,
    caseUrlKey,
    sessionId,
    sessionMeta,
    heatmapVisible,
    submittedQuestionAnswers,
  } = useContext(DataContext).data;
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [prefTick, setPrefTick] = useState(0);
  const [demoStats, setDemoStats] = useState({ visitors: 0, answers: 0 });

  useEffect(() => {
    const onPrefs = () => setPrefTick((t) => t + 1);
    window.addEventListener(PREF_EVENT, onPrefs);
    return () => window.removeEventListener(PREF_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    if (heatmapVisible) setOpen(true);
  }, [heatmapVisible]);

  void prefTick;
  const showLeaderboard = getLeaderboardEnabled(userData);

  const isSessionOwner = isPresenter({
    sessionId,
    userId: userData?.id,
    ownerId: sessionMeta?.owner,
  });
  const caseLink = { studyId, dicomSeriesId, caseUrlKey };
  const linked = isCaseLinked(caseLink);
  const authorId = userData?.id;
  const revealed = heatmapVisible;

  useEffect(() => {
    if (!isDemoPresenter() || !supabaseClient || !sessionId) return;
    let cancelled = false;
    const load = () => {
      fetchDemoStats(supabaseClient, sessionId)
        .then((stats) => {
          if (!cancelled) setDemoStats(stats);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [supabaseClient, sessionId, submittedQuestionAnswers]);

  const fetchQuestions = useCallback(async () => {
    if (!isSessionOwner) {
      setQuestions([]);
      return;
    }
    if (isDemoMode()) {
      setQuestions(getDemoQuestions());
      return;
    }
    if (!supabaseClient || !linked || !authorId) {
      setQuestions([]);
      return;
    }
    try {
      let query = supabaseClient
        .from("series_annotations")
        .select("*")
        .eq("kind", "question")
        .order("created_at", { ascending: true });
      query = applyQuestionCaseFilter(query, { ...caseLink, authorId });
      if (!query) return;
      const { data, error } = await query;
      if (error) throw error;
      setQuestions(data || []);
    } catch (e) {
      console.error("Failed to load question results:", e);
    }
  }, [supabaseClient, linked, authorId, isSessionOwner, studyId, dicomSeriesId, caseUrlKey]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    if (open) fetchQuestions();
  }, [open, fetchQuestions]);

  const mcqLeaderboard = useMemo(
    () => (revealed ? computeMcqLeaderboard(questions, submittedQuestionAnswers) : []),
    [revealed, questions, submittedQuestionAnswers]
  );

  const responders = useMemo(
    () => Object.values(submittedQuestionAnswers || {}),
    [submittedQuestionAnswers]
  );

  const questionSlides = useMemo(
    () =>
      questions.map((q, idx) => {
        const mcq = isMcqQuestion(q);
        return (
          <div key={q.id} className="rounded-xl border border-slate-700 overflow-hidden h-full flex flex-col">
            <div className="shrink-0 px-3 py-2 bg-slate-800/60 border-b border-slate-700 flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug break-words text-slate-100">
                  {q.question}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {mcq ? (
                    <ListChecks className="h-3 w-3 text-slate-400" />
                  ) : (
                    <MessageSquare className="h-3 w-3 text-slate-400" />
                  )}
                  <span className="text-[10px] text-slate-400">
                    {mcq ? "Multiple choice" : "Free response"}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {mcq ? (
                <McqView q={q} responders={responders} revealed={revealed} />
              ) : (
                <FreeResponseView q={q} responders={responders} revealed={revealed} />
              )}
            </div>
          </div>
        );
      }),
    [questions, responders, revealed]
  );

  if (!isSessionOwner || questions.length === 0) return null;

  const responderLabel = `${responders.length} participant${responders.length !== 1 ? "s" : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="View answers & distribution"
        className={cn(
          "shrink-0 flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors",
          open
            ? "bg-emerald-600/20 border-emerald-500/60 text-emerald-300"
            : "bg-slate-950 border-slate-800 text-emerald-400 hover:bg-slate-900"
        )}
      >
        <BarChart3 className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
        <div className={PANEL_CLASS}>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-700">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <BarChart3 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {revealed ? "Answers & distribution" : "Questions"}
                </span>
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {isDemoPresenter()
                  ? `${demoStats.visitors} visitor${demoStats.visitors !== 1 ? "s" : ""} · ${responders.length} answered`
                  : responderLabel}
                {!revealed && (
                  <span className="text-slate-500"> · Press Space to reveal</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 overflow-hidden flex flex-col px-3.5 py-3">
            <QuestionSlideCarousel
              slides={questionSlides}
              className="min-h-0 max-h-[55vh]"
              dotActiveClassName="bg-emerald-500"
            />

            {LEADERBOARD_ENABLED && revealed && showLeaderboard && mcqLeaderboard.length > 0 && (
              <div className="shrink-0 mt-2 pt-2 border-t border-slate-700/80">
                <Leaderboard entries={mcqLeaderboard.slice(0, 3)} mode="mcq" compact />
              </div>
            )}
          </div>
        </div>
        , document.body)}
    </>
  );
}

function McqView({ q, responders, revealed }) {
  const opts = normalizeMcqOptions(q.options);
  const total = responders.filter(
    (r) => r.answers?.[q.id]?.selectedIndex != null
  ).length;

  const counts = opts.choices.map(
    (_, i) =>
      responders.filter((r) => r.answers?.[q.id]?.selectedIndex === i).length
  );

  return (
    <div className="space-y-1.5">
      {opts.choices.map((choice, i) => {
        const letter = String.fromCharCode(65 + i);
        const count = counts[i];
        const pct = total ? Math.round((count / total) * 100) : 0;
        const isCorrect = revealed && opts.correctIndex === i;

        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span
                className={cn(
                  "flex items-center gap-1.5 min-w-0",
                  isCorrect ? "text-emerald-400 font-medium" : "text-slate-200"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-700 text-slate-200"
                  )}
                >
                  {letter}
                </span>
                <span className="truncate">{choice || `Option ${letter}`}</span>
                {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              </span>
              {revealed && (
                <span className="shrink-0 tabular-nums text-slate-400">
                  {count} · {pct}%
                </span>
              )}
            </div>
            {revealed && (
              <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isCorrect ? "bg-emerald-500" : "bg-blue-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FreeResponseView({ q, responders, revealed }) {
  const answers = responders
    .map((r) => ({ name: r.userName, text: r.answers?.[q.id]?.text }))
    .filter((a) => a.text);

  if (!revealed) {
    return (
      <p className="text-xs text-slate-500">
        {answers.length} response{answers.length !== 1 ? "s" : ""} submitted
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {q.answer && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium">
            Correct answer
          </p>
          <p className="text-xs text-emerald-100 break-words">{q.answer}</p>
        </div>
      )}

      {answers.length === 0 ? (
        <p className="text-xs text-slate-400">No responses yet.</p>
      ) : (
        <div className="space-y-1">
          {answers.map((a, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="text-slate-400 shrink-0">{a.name}:</span>
              <span className="text-slate-200 break-words">{a.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OwnerResultsOverlay;
