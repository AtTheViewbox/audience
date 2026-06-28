import { useContext, useEffect, useRef } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { isCaseLinked } from "../lib/answerKeyCase.js";
import {
  fetchBoxAnnotationRows,
  flattenBoxRows,
  restoreBoxRows,
  boxesArePlaced,
  viewportsHaveStacks,
  setPersistedBoxAnnotationsVisible,
} from "../lib/answerKeyBoxes.js";

/** Load persisted answer-key boxes from Supabase and restore them on the correct viewport/slice. */
function AnswerKeyBoxLoader() {
  const {
    renderingEngine,
    studyId,
    dicomSeriesId,
    caseUrlKey,
    isRequestLoading,
    ld,
    sessionId,
    heatmapVisible,
  } = useContext(DataContext).data;
  const { userData, supabaseClient } = useContext(UserContext).data;
  const { dispatch } = useContext(DataDispatchContext);

  const caseLink = { studyId, dicomSeriesId, caseUrlKey };
  const linked = isCaseLinked(caseLink);
  const loadKeyRef = useRef(null);

  useEffect(() => {
    if (!linked || !supabaseClient || !userData?.id || !renderingEngine || isRequestLoading) {
      return;
    }

    const loadKey = [studyId, dicomSeriesId, caseUrlKey, ld?.r, ld?.c].join("|");
    if (loadKeyRef.current !== loadKey) {
      loadKeyRef.current = null;
    }

    let cancelled = false;
    let timer = null;

    const syncFromTable = async () => {
      const rows = await fetchBoxAnnotationRows(supabaseClient, caseLink, userData.id);
      if (cancelled) return false;

      dispatch({ type: "set_persisted_answer_boxes", payload: flattenBoxRows(rows) });

      if (!viewportsHaveStacks(renderingEngine)) return false;

      if (!boxesArePlaced(renderingEngine, rows)) {
        restoreBoxRows(renderingEngine, rows);
      }

      if (sessionId) {
        setPersistedBoxAnnotationsVisible(renderingEngine, heatmapVisible);
      }

      loadKeyRef.current = loadKey;
      return true;
    };

    const attempt = () => {
      syncFromTable()
        .then((done) => {
          if (done && timer) {
            window.clearInterval(timer);
            timer = null;
          }
        })
        .catch((e) => console.error("Failed to sync answer-key boxes:", e));
    };

    attempt();
    timer = window.setInterval(attempt, 600);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    linked,
    studyId,
    dicomSeriesId,
    caseUrlKey,
    renderingEngine,
    isRequestLoading,
    ld?.r,
    ld?.c,
    sessionId,
    heatmapVisible,
    userData?.id,
    supabaseClient,
    dispatch,
  ]);

  return null;
}

export default AnswerKeyBoxLoader;
