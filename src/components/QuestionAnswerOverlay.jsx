import { useContext, useEffect, useState, useCallback } from "react";
import { ClipboardList, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { fetchHostAnswerContent } from "../lib/fetchHostAnswerContent.js";
import { isDemoPresenter } from "../lib/demoCase.js";
import QuestionAnswerPanel from "./QuestionAnswerPanel.jsx";

const PANEL_SHELL =
  "dark fixed top-14 right-3 z-[110] w-[min(380px,calc(100vw-1rem))] max-h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl backdrop-blur-sm";

/**
 * Participant answer control in the top-right rail. Panel can be hidden to draw
 * boxes on the viewer; submission happens once from the panel.
 */
function ParticipantAnswerOverlay() {
  const {
    studyId,
    dicomSeriesId,
    caseUrlKey,
    sessionId,
    sessionMeta,
    sessionCaseLink,
  } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [hasContent, setHasContent] = useState(false);

  const isSessionOwner =
    (sessionId && userData && sessionMeta?.owner === userData.id) || isDemoPresenter();
  const isParticipant = sessionId && !isSessionOwner;
  // Prefer the author-broadcast case identifiers: participants often can't
  // resolve the case locally (RLS on studies, or a stale URL after a transfer).
  const hasSessionCaseLink =
    sessionCaseLink &&
    (sessionCaseLink.studyId || sessionCaseLink.dicomSeriesId || sessionCaseLink.caseUrlKey);
  const caseLink = hasSessionCaseLink
    ? sessionCaseLink
    : { studyId, dicomSeriesId, caseUrlKey };
  const authorId = sessionMeta?.owner;

  const loadContent = useCallback(async () => {
    if (!isParticipant || !authorId) {
      setQuestions([]);
      setHasContent(false);
      dispatch({ type: "set_participant_answer_content", payload: false });
      return;
    }
    const result = await fetchHostAnswerContent(supabaseClient, caseLink, authorId);
    setQuestions(result.questions);
    setHasContent(result.hasContent);
    dispatch({ type: "set_participant_answer_content", payload: result.hasContent });
  }, [
    isParticipant,
    authorId,
    supabaseClient,
    dispatch,
    caseLink.studyId,
    caseLink.dicomSeriesId,
    caseLink.caseUrlKey,
  ]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    if (open) loadContent();
  }, [open, loadContent]);

  if (!isParticipant || !hasContent) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Hide answer panel" : "Answer questions"}
        className={cn(
          "shrink-0 flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors",
          open
            ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
            : "bg-slate-950 border-slate-800 text-blue-400 hover:bg-slate-900"
        )}
      >
        <ClipboardList className="h-4 w-4" />
      </button>

      {open && (
        <div className={PANEL_SHELL}>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-700">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <ClipboardList className="h-4 w-4 text-blue-400" />
              Answer
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                title="Hide to draw boxes"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden flex flex-col p-3.5 pt-3">
            <QuestionAnswerPanel questions={questions} />
          </div>
        </div>
      )}
    </>
  );
}

export default ParticipantAnswerOverlay;
