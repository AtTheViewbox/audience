import { useContext, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Send, CheckCircle2, Circle, MessageSquare, ListChecks, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { isCaseLinked, applyQuestionCaseFilter, caseKeyFromLink } from "../lib/answerKeyCase.js";
import { isMcqQuestion, normalizeMcqOptions, QUESTION_TYPES } from "../lib/questionTypes.js";
import {
  participantHasSubmitted,
  submitParticipantResponse,
} from "../lib/participantSubmit.js";
import {
  computeMcqLeaderboard,
  formatMcqAnswerLabel,
} from "../lib/leaderboard.js";
import { getLeaderboardEnabled, PREF_EVENT } from "../lib/userPreferences.js";
import Leaderboard from "./Leaderboard.jsx";
import QuestionSlideCarousel from "./QuestionSlideCarousel.jsx";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

// Temporarily disabled: leaderboard scores aren't reliably persisting across
// session transfers yet. Flip back to true once that's resolved.
const LEADERBOARD_ENABLED = false;

function emptyDrafts(questions) {
  const d = {};
  for (const q of questions) {
    d[q.id] = isMcqQuestion(q)
      ? { type: QUESTION_TYPES.MCQ, selectedIndex: null }
      : { type: QUESTION_TYPES.FREE_RESPONSE, text: "" };
  }
  return d;
}

function QuestionCardShell({ idx, q, children }) {
  const mcq = isMcqQuestion(q);
  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 bg-slate-800/60 border-b border-slate-700 flex items-start gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white">
          {idx + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug break-words">{q.question}</p>
          <div className="flex items-center gap-1 mt-0.5">
            {mcq ? (
              <ListChecks className="h-3 w-3 text-slate-400" />
            ) : (
              <MessageSquare className="h-3 w-3 text-slate-400" />
            )}
            <span className="text-[10px] text-slate-400">
              {mcq ? "Pick one" : "Your response"}
            </span>
          </div>
        </div>
      </div>
      <div className="p-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}

function SubmittedReview({ questions, mySubmission, userId, submittedQuestionAnswers, showLeaderboard }) {
  const answers = mySubmission?.answers || {};
  const boxCount = mySubmission?.boxes?.length;
  const hasBoxSubmission = boxCount != null && boxCount > 0;

  // Leaderboard is based purely on MCQ correctness. With no MCQ questions
  // there's nothing to score, so the leaderboard simply won't render.
  const leaderboard = useMemo(
    () => computeMcqLeaderboard(questions, submittedQuestionAnswers),
    [questions, submittedQuestionAnswers]
  );

  const answeredQuestions = questions.filter((q) => answers[q.id]);

  const answerSlides = answeredQuestions.map((q, idx) => {
    const ans = answers[q.id];
    const mcq = isMcqQuestion(q);
    return (
      <div
        key={q.id}
        className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2"
      >
        <p className="text-xs font-medium text-slate-200 break-words leading-snug">
          <span className="text-slate-500 mr-1">{idx + 1}.</span>
          {q.question}
        </p>
        <p className="text-xs text-blue-300 break-words mt-1 pl-4">
          {mcq ? formatMcqAnswerLabel(q, ans.selectedIndex) : ans.text || "—"}
        </p>
      </div>
    );
  });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-sm font-medium text-slate-200">Submitted</p>
        {hasBoxSubmission && (
          <span className="text-xs text-slate-400">
            · {boxCount} box{boxCount !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {answerSlides.length > 1 && (
        <QuestionSlideCarousel slides={answerSlides} compact />
      )}

      {answerSlides.length === 1 && answerSlides[0]}

      {LEADERBOARD_ENABLED && showLeaderboard && (
        <Leaderboard
          entries={leaderboard}
          mode="mcq"
          highlightUserId={userId}
          compact
        />
      )}
    </div>
  );
}

function QuestionAnswerPanel({ questions: questionsProp }) {
  const {
    studyId,
    dicomSeriesId,
    caseUrlKey,
    sessionId,
    sessionMeta,
    interactionChannel,
    submittedQuestionAnswers,
    submittedAnnotations,
    renderingEngine,
    leaderboardEnabled,
    sessionCaseLink,
  } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [loadedQuestions, setLoadedQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [prefTick, setPrefTick] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const carouselRef = useRef(null);

  const questions = questionsProp?.length ? questionsProp : loadedQuestions;

  useEffect(() => {
    setQuestionIndex(0);
  }, [questions]);

  useEffect(() => {
    const onPrefs = () => setPrefTick((t) => t + 1);
    window.addEventListener(PREF_EVENT, onPrefs);
    return () => window.removeEventListener(PREF_EVENT, onPrefs);
  }, []);

  void prefTick;
  // In a session the author controls leaderboard visibility for everyone;
  // outside a session fall back to this user's own preference.
  const showLeaderboard = sessionId ? leaderboardEnabled !== false : getLeaderboardEnabled(userData);

  const userId = userData?.id;
  const hasSubmitted = participantHasSubmitted(
    userId,
    submittedAnnotations,
    submittedQuestionAnswers
  );

  const myQuestionSubmission = submittedQuestionAnswers?.[userId];
  const myBoxSubmission = submittedAnnotations?.[userId];
  const mySubmission = {
    answers: myQuestionSubmission?.answers,
    boxes: myBoxSubmission?.boxes,
  };

  const caseLink = { studyId, dicomSeriesId, caseUrlKey };
  const authorId = sessionMeta?.owner;
  // Submissions are scoped to the case so a transfer to a new case doesn't keep
  // participants locked on the previous case's "submitted" state. Prefer the
  // author-broadcast case identity (participants often can't resolve it locally).
  const hasSessionCaseLink =
    sessionCaseLink &&
    (sessionCaseLink.studyId || sessionCaseLink.dicomSeriesId || sessionCaseLink.caseUrlKey);
  const submissionCaseKey = caseKeyFromLink(hasSessionCaseLink ? sessionCaseLink : caseLink);

  const fetchQuestions = useCallback(async () => {
    if (questionsProp?.length || !supabaseClient || !isCaseLinked(caseLink) || !authorId) return;
    setLoading(true);
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
      setLoadedQuestions(data || []);
    } catch (e) {
      console.error("Failed to load questions:", e);
    } finally {
      setLoading(false);
    }
  }, [questionsProp?.length, supabaseClient, authorId, studyId, dicomSeriesId, caseUrlKey]);

  useEffect(() => {
    if (sessionId && authorId) fetchQuestions();
  }, [sessionId, authorId, fetchQuestions]);

  useEffect(() => {
    setDrafts((prev) => {
      const next = emptyDrafts(questions);
      for (const q of questions) {
        if (prev[q.id]) next[q.id] = prev[q.id];
      }
      return next;
    });
  }, [questions]);

  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const d = drafts[q.id];
      if (!d) return false;
      if (d.type === QUESTION_TYPES.MCQ) return d.selectedIndex != null;
      return d.text?.trim().length > 0;
    }).length;
  }, [questions, drafts]);

  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  const setMcqChoice = (questionId, index) => {
    if (hasSubmitted) return;
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { type: QUESTION_TYPES.MCQ, selectedIndex: index },
    }));
  };

  const setFreeText = (questionId, text) => {
    if (hasSubmitted) return;
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { type: QUESTION_TYPES.FREE_RESPONSE, text },
    }));
  };

  const handleSubmit = async () => {
    if (!userId || hasSubmitted) return;

    const answers = {};
    for (const q of questions) {
      const d = drafts[q.id];
      if (!d) continue;
      if (d.type === QUESTION_TYPES.MCQ && d.selectedIndex != null) {
        answers[q.id] = { type: QUESTION_TYPES.MCQ, selectedIndex: d.selectedIndex };
      } else if (d.type === QUESTION_TYPES.FREE_RESPONSE && d.text?.trim()) {
        answers[q.id] = { type: QUESTION_TYPES.FREE_RESPONSE, text: d.text.trim() };
      }
    }

    try {
      setSubmitting(true);
      const ok = submitParticipantResponse({
        userId,
        userName: userData.user_metadata?.full_name || userData.email || "Anonymous",
        answers,
        interactionChannel,
        dispatch,
        renderingEngine,
        submittedAnnotations,
        submittedQuestionAnswers,
        supabaseClient,
        sessionId,
        caseKey: submissionCaseKey,
      });
      if (ok) {
        dispatch({ type: "select_tool", payload: "scroll" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const multiQuestion = questions.length > 1;
  const isLastQuestion = !multiQuestion || questionIndex >= questions.length - 1;

  const handlePrimaryAction = () => {
    if (multiQuestion && !isLastQuestion) {
      carouselRef.current?.scrollTo(questionIndex + 1);
      return;
    }
    handleSubmit();
  };

  const questionSlides = useMemo(() => {
    return questions.map((q, idx) => {
      const draft = drafts[q.id];
      const mcq = isMcqQuestion(q);
      const opts = mcq ? normalizeMcqOptions(q.options) : null;

      return (
        <QuestionCardShell key={q.id} idx={idx} q={q}>
          {mcq ? (
            <div className="flex flex-col gap-1.5">
              {opts.choices.map((choice, i) => {
                const selected = draft?.selectedIndex === i;
                const letter = String.fromCharCode(65 + i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!choice.trim()}
                    onClick={() => setMcqChoice(q.id, i)}
                    className={cn(
                      "group w-full text-left px-2.5 py-2 rounded-lg border transition-all flex items-center gap-2",
                      selected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/60",
                      !choice.trim() && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        selected ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-300"
                      )}
                    >
                      {letter}
                    </span>
                    <span className="text-xs flex-1 break-words">{choice || `Option ${letter}`}</span>
                    {selected ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <Textarea
              value={draft?.text || ""}
              onChange={(e) => setFreeText(q.id, e.target.value)}
              placeholder="Type your answer…"
              rows={3}
              className="resize-none text-sm border-slate-700 focus-visible:ring-blue-500/30 min-h-[72px]"
            />
          )}
        </QuestionCardShell>
      );
    });
  }, [questions, drafts, hasSubmitted]);

  if (!sessionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Join a share session to answer questions from the session host.
      </p>
    );
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading questions…</p>;
  }

  if (hasSubmitted) {
    return (
      <SubmittedReview
        questions={questions}
        mySubmission={mySubmission}
        userId={userId}
        submittedQuestionAnswers={submittedQuestionAnswers}
        showLeaderboard={showLeaderboard}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-0 gap-3">
      {questions.length > 0 && (
        <>
          <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/40 p-2.5 space-y-1.5">
            <span className="text-xs font-medium text-slate-400">
              {answeredCount} of {questions.length} answered
            </span>
            <Progress value={progress} className="h-1.5" />
          </div>

          <QuestionSlideCarousel
            ref={carouselRef}
            slides={questionSlides}
            className="min-h-0 max-h-[55vh]"
            onIndexChange={setQuestionIndex}
          />
        </>
      )}

      {questions.length === 0 && (
        <p className="text-sm text-slate-400 shrink-0">
          Use <strong className="text-slate-300">Add box</strong> below to draw on the viewer, then submit here.
        </p>
      )}

      <Button
        type="button"
        className="w-full shrink-0"
        disabled={submitting}
        onClick={handlePrimaryAction}
      >
        {multiQuestion && !isLastQuestion ? (
          <>
            <ChevronRight className="h-4 w-4 mr-2" />
            Next question
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit
          </>
        )}
      </Button>
    </div>
  );
}

export default QuestionAnswerPanel;
