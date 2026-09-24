import { useContext, useEffect, useRef } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { isCaseLinked } from "../lib/answerKeyCase.js";
import { isDemoMode, getDemoBoxRows } from "../lib/demoCase.js";
import { fetchHostAnswerContent } from "../lib/fetchHostAnswerContent.js";
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
  const fetchedKeyRef = useRef(null);
  const rowsRef = useRef(null);

  const demoMode = isDemoMode();

  useEffect(() => {
    if (!renderingEngine || isRequestLoading) return;
    if (!demoMode && (!linked || !supabaseClient || !userData?.id)) return;

    const loadKey = [studyId, dicomSeriesId, caseUrlKey, ld?.r, ld?.c, demoMode].join("|");
    if (fetchedKeyRef.current !== loadKey) {
      fetchedKeyRef.current = null;
      rowsRef.current = null;
    }

    let cancelled = false;
    let timer = null;
    let tries = 0;

    const loadRows = async () => {
      if (rowsRef.current && fetchedKeyRef.current === loadKey) return rowsRef.current;
      const rows = demoMode
        ? getDemoBoxRows()
        : (userData?.id && supabaseClient
            ? await fetchBoxAnnotationRows(supabaseClient, caseLink, userData.id)
            : []);
      if (cancelled) return [];
      rowsRef.current = rows;
      fetchedKeyRef.current = loadKey;
      dispatch({ type: "set_persisted_answer_boxes", payload: flattenBoxRows(rows) });
      const content = demoMode
        ? { hasContent: true }
        : await fetchHostAnswerContent(supabaseClient, caseLink, userData?.id);
      if (!cancelled) {
        dispatch({
          type: "set_host_answer_content",
          payload: !!(content.hasContent || flattenBoxRows(rows).length),
        });
      }
      return rows;
    };

    const attempt = async () => {
      try {
        const rows = await loadRows();
        if (cancelled) return;
        if (!viewportsHaveStacks(renderingEngine)) {
          if (tries++ < 20) timer = window.setTimeout(attempt, 500);
          return;
        }
        if (!boxesArePlaced(renderingEngine, rows)) {
          const restored = restoreBoxRows(renderingEngine, rows, { replaceExisting: demoMode });
          if (!restored && tries++ < 20) {
            timer = window.setTimeout(attempt, 500);
            return;
          }
        }
        // Hide until Show Answer — demo joins a persistent session, but also
        // hide for a presenter who has not connected yet.
        if (sessionId || demoMode) {
          setPersistedBoxAnnotationsVisible(renderingEngine, heatmapVisible);
        }
      } catch (e) {
        console.error("Failed to sync answer-key boxes:", e);
      }
    };

    attempt();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
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
    demoMode,
    dispatch,
  ]);

  return null;
}

export default AnswerKeyBoxLoader;
