import { useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  Trash2,
  X,
  Undo2,
  Redo2,
  Crosshair,
  Flame,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { eventTarget } from "@cornerstonejs/core";
import { resolveViewportIndex } from "../lib/answerKeyBoxes.js";
import {
  participantHasSubmitted,
} from "../lib/participantSubmit.js";
import {
  collectSubmissionHeatmapBoxes,
  collectAnswerKeyBoxes,
  snapToBoxAtIndex,
  snapToDensityPeak,
} from "../lib/heatmapNavigation.js";

function newUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function cloneAnnotation(annotation) {
  return {
    annotationUID: annotation.annotationUID,
    highlighted: false,
    invalidated: true,
    isLocked: false,
    isVisible: true,
    metadata: { ...annotation.metadata },
    data: JSON.parse(JSON.stringify(annotation.data)),
  };
}

function AnnotationPanel() {
  const {
    toolSelected,
    interactionChannel,
    renderingEngine,
    sessionId,
    sessionMeta,
    submittedAnnotations,
    submittedQuestionAnswers,
    heatmapVisible,
    answerKeyAuthoring,
    participantAnswerContentAvailable,
    studyId,
    dicomSeriesId,
    caseUrlKey,
    persistedAnswerBoxes,
  } = useContext(DataContext).data;
  const { userData, supabaseClient } = useContext(UserContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [totalAnnotationCount, setTotalAnnotationCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const boxSnapIndexRef = useRef(0);

  const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;
  const submitterCount = new Set([
    ...Object.keys(submittedAnnotations || {}),
    ...Object.keys(submittedQuestionAnswers || {}),
  ]).size;

  const showAuthorControls = answerKeyAuthoring && toolSelected === "annotate";
  const showParticipantControls =
    participantAnswerContentAvailable && !isSessionOwner && !answerKeyAuthoring;

  const participantSubmitted = participantHasSubmitted(
    userData?.id,
    submittedAnnotations,
    submittedQuestionAnswers
  );
  const showHeatmapOwnerBar =
    isSessionOwner && sessionId && !showAuthorControls && !showParticipantControls;

  const submissionBoxes = collectSubmissionHeatmapBoxes(submittedAnnotations);
  const answerKeyBoxes = collectAnswerKeyBoxes(persistedAnswerBoxes);
  const hasHeatmapData = submitterCount > 0 || submissionBoxes.length > 0;

  useEffect(() => {
    if (heatmapVisible) {
      boxSnapIndexRef.current = 0;
    }
  }, [heatmapVisible]);

  const handleNextBoxSnap = useCallback(async () => {
    if (!heatmapVisible || !renderingEngine || answerKeyBoxes.length === 0) return;
    boxSnapIndexRef.current = (boxSnapIndexRef.current + 1) % answerKeyBoxes.length;
    await snapToBoxAtIndex(renderingEngine, answerKeyBoxes, boxSnapIndexRef.current);
  }, [heatmapVisible, renderingEngine, answerKeyBoxes]);

  const handleDensitySnap = useCallback(async () => {
    if (!heatmapVisible || !renderingEngine || submissionBoxes.length === 0) return;
    await snapToDensityPeak(renderingEngine, submissionBoxes);
  }, [heatmapVisible, renderingEngine, submissionBoxes]);

  const syncHistoryCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  const pushUndoEntry = useCallback(
    (annotationUID, element) => {
      const mgr = cornerstoneTools.annotation.state;
      const ann = mgr.getAnnotation(annotationUID);
      if (!ann) return;

      const existing = undoStackRef.current.find((e) => e.uid === annotationUID);
      if (existing) {
        existing.rowId = ann.answerKeyRowId || existing.rowId;
        existing.element = element || existing.element;
        return;
      }

      undoStackRef.current.push({
        uid: annotationUID,
        element,
        rowId: ann.answerKeyRowId || null,
      });
      redoStackRef.current = [];
      syncHistoryCounts();
    },
    [syncHistoryCounts]
  );

  const getRects = useCallback(() => {
    try {
      const mgr = cornerstoneTools.annotation.state;
      return mgr
        .getAllAnnotations()
        .filter((a) => a.metadata?.toolName === "RectangleROI");
    } catch {
      return [];
    }
  }, []);

  const countAnnotations = useCallback(() => {
    try {
      const allRects = getRects();
      const unsubmitted = allRects.filter((a) => !a.isLocked);
      setAnnotationCount(unsubmitted.length);
      setTotalAnnotationCount(allRects.length);
    } catch {
      setAnnotationCount(0);
      setTotalAnnotationCount(0);
    }
  }, [getRects]);

  useEffect(() => {
    if (!showHeatmapOwnerBar) return;
    countAnnotations();
    const id = window.setInterval(countAnnotations, 500);
    return () => window.clearInterval(id);
  }, [showHeatmapOwnerBar, countAnnotations, submittedAnnotations, heatmapVisible]);

  const renderAll = useCallback(() => {
    renderingEngine?.getViewports().forEach((vp) => vp.render());
    countAnnotations();
  }, [renderingEngine, countAnnotations]);

  const deleteAnswerKeyRow = useCallback(
    async (rowId) => {
      if (!rowId || !supabaseClient) return;
      try {
        await supabaseClient.from("series_annotations").delete().eq("id", rowId);
        dispatch({ type: "remove_persisted_answer_box", payload: rowId });
      } catch (e) {
        console.error("Failed to delete answer-key row:", e);
      }
    },
    [supabaseClient, dispatch]
  );

  const saveAnswerKeyBox = useCallback(
    async (annotation) => {
      if (!supabaseClient || !userData?.id) return null;

      const imageId = annotation.metadata?.referencedImageId || "";
      const box = {
        imageId,
        points: annotation.data?.handles?.points || [],
        viewPlaneNormal: annotation.metadata?.viewPlaneNormal,
        viewUp: annotation.metadata?.viewUp,
        FrameOfReferenceUID: annotation.metadata?.FrameOfReferenceUID,
        viewportIndex: renderingEngine
          ? resolveViewportIndex(renderingEngine, imageId)
          : 0,
      };

      const { data, error } = await supabaseClient
        .from("series_annotations")
        .insert({
          user_id: userData.id,
          study_id: studyId || null,
          dicom_series_id: dicomSeriesId || null,
          case_url_params:
            !studyId && !dicomSeriesId ? caseUrlKey : null,
          kind: "box",
          boxes: [box],
        })
        .select("id")
        .single();

      if (error) throw error;
      dispatch({ type: "append_persisted_answer_box", payload: { rowId: data?.id, ...box } });
      return data?.id || null;
    },
    [supabaseClient, userData?.id, studyId, dicomSeriesId, caseUrlKey, renderingEngine, dispatch]
  );

  useEffect(() => {
    if (!showAuthorControls && !showParticipantControls) return;

    countAnnotations();

    const handler = () => requestAnimationFrame(countAnnotations);

    const onComplete = () => {
      requestAnimationFrame(() => {
        countAnnotations();
        if (showParticipantControls && !participantSubmitted) {
          dispatch({ type: "select_tool", payload: "scroll" });
        }
      });
    };

    eventTarget.addEventListener(
      cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED,
      showParticipantControls ? onComplete : handler
    );
    eventTarget.addEventListener(
      cornerstoneTools.Enums.Events.ANNOTATION_REMOVED,
      handler
    );

    return () => {
      eventTarget.removeEventListener(
        cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED,
        showParticipantControls ? onComplete : handler
      );
      eventTarget.removeEventListener(
        cornerstoneTools.Enums.Events.ANNOTATION_REMOVED,
        handler
      );
    };
  }, [
    toolSelected,
    showAuthorControls,
    showParticipantControls,
    participantSubmitted,
    countAnnotations,
    dispatch,
  ]);

  useEffect(() => {
    if (!showAuthorControls) {
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryCounts();
      return;
    }

    const onCompleted = (evt) => {
      const annotation = evt.detail?.annotation;
      if (annotation?.metadata?.toolName !== "RectangleROI") return;

      const viewports = renderingEngine?.getViewports() || [];
      const element =
        viewports.find((vp) => {
          try {
            return cornerstoneTools.annotation.state
              .getAnnotations("RectangleROI", vp.element)
              ?.some((a) => a.annotationUID === annotation.annotationUID);
          } catch {
            return false;
          }
        })?.element || viewports[0]?.element;

      pushUndoEntry(annotation.annotationUID, element);
      requestAnimationFrame(countAnnotations);
      // Auto-save is async; pick up the DB row id once it lands.
      setTimeout(() => pushUndoEntry(annotation.annotationUID, element), 300);
    };

    eventTarget.addEventListener(
      cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED,
      onCompleted
    );
    return () => {
      eventTarget.removeEventListener(
        cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED,
        onCompleted
      );
    };
  }, [showAuthorControls, renderingEngine, pushUndoEntry, countAnnotations]);

  const handleAuthorUndo = async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;

    try {
      const mgr = cornerstoneTools.annotation.state;
      const annotation = mgr.getAnnotation(entry.uid);
      if (annotation) {
        redoStackRef.current.push({
          snapshot: cloneAnnotation(annotation),
          element: entry.element,
          rowId: annotation.answerKeyRowId || entry.rowId || null,
        });
        await deleteAnswerKeyRow(annotation.answerKeyRowId || entry.rowId);
        mgr.removeAnnotation(entry.uid);
      }
      syncHistoryCounts();
      renderAll();
    } catch (e) {
      console.error("Error undoing annotation:", e);
    }
  };

  const handleAuthorRedo = async () => {
    const entry = redoStackRef.current.pop();
    if (!entry?.snapshot || !entry.element) return;

    try {
      const mgr = cornerstoneTools.annotation.state;
      const restored = {
        ...entry.snapshot,
        annotationUID: newUid(),
        answerKeySaved: false,
      };

      mgr.addAnnotation(restored, entry.element);

      const rowId = await saveAnswerKeyBox(restored);
      if (rowId) {
        restored.answerKeySaved = true;
        restored.answerKeyRowId = rowId;
      }

      undoStackRef.current.push({
        uid: restored.annotationUID,
        element: entry.element,
        rowId: rowId || null,
      });

      syncHistoryCounts();
      renderAll();
    } catch (e) {
      console.error("Error redoing annotation:", e);
      toast.error("Failed to redo box");
    }
  };

  const handleAuthorClearAll = async () => {
    try {
      const mgr = cornerstoneTools.annotation.state;
      const rects = getRects();

      const rowIds = rects
        .map((a) => a.answerKeyRowId)
        .filter(Boolean);

      rects.forEach((a) => mgr.removeAnnotation(a.annotationUID));

      if (rowIds.length > 0 && supabaseClient) {
        await supabaseClient
          .from("series_annotations")
          .delete()
          .in("id", rowIds);
      }

      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryCounts();
      renderAll();
    } catch (e) {
      console.error("Error clearing annotations:", e);
    }
  };

  const handleCloseAuthoring = () => {
    dispatch({ type: "set_answer_key_authoring", payload: false });
    dispatch({ type: "select_tool", payload: "scroll" });
  };

  const handleAddBox = () => {
    if (participantSubmitted) return;
    dispatch({ type: "select_tool", payload: "annotate" });
  };

  if (!showAuthorControls && !showParticipantControls && !showHeatmapOwnerBar) {
    return null;
  }

  if (showHeatmapOwnerBar) {
    const sentLabel =
      submitterCount === 0
        ? "none"
        : submitterCount === 1
          ? "1 sent"
          : `${submitterCount} sent`;

    return (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/85 border border-slate-700/80 shadow-md backdrop-blur-sm">
        <button
          onClick={() => dispatch({ type: "toggle_heatmap" })}
          disabled={!hasHeatmapData}
          className={`text-[9px] px-2 py-0.5 rounded-full transition-colors tabular-nums ${
            !hasHeatmapData
              ? "text-slate-600 cursor-not-allowed"
              : heatmapVisible
                ? "text-blue-400 bg-blue-600/15 font-medium"
                : "text-slate-300 hover:text-slate-100 hover:bg-slate-800/80"
          }`}
          title={
            !hasHeatmapData
              ? "Waiting for submissions"
              : heatmapVisible
                ? "Hide answer (Space)"
                : "Show answer (Space)"
          }
        >
          {sentLabel}
        </button>

        {heatmapVisible && (answerKeyBoxes.length > 0 || submissionBoxes.length > 0) && (
          <>
            <div className="w-px h-3 bg-slate-700/80" />

            {answerKeyBoxes.length > 0 && (
              <button
                onClick={handleNextBoxSnap}
                className="text-[9px] px-1.5 py-0.5 rounded-full transition-colors flex items-center gap-1 text-slate-300 hover:text-slate-100 hover:bg-slate-800/80"
                title="Snap to next answer-key box"
              >
                <Crosshair className="h-2.5 w-2.5" />
              </button>
            )}

            {submissionBoxes.length > 0 && (
              <button
                onClick={handleDensitySnap}
                className="text-[9px] px-1.5 py-0.5 rounded-full transition-colors flex items-center gap-1 text-slate-300 hover:text-slate-100 hover:bg-slate-800/80"
                title="Snap to highest participant density"
              >
                <Flame className="h-2.5 w-2.5" />
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (showAuthorControls) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg backdrop-blur-sm">
        <span className="text-[10px] text-slate-400 whitespace-nowrap">
          {totalAnnotationCount} box{totalAnnotationCount !== 1 ? "es" : ""}
        </span>

        <div className="w-px h-4 bg-slate-700" />

        <button
          onClick={handleAuthorUndo}
          disabled={undoCount === 0}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${
            undoCount > 0
              ? "bg-slate-800 border-slate-600 text-slate-200"
              : "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
          }`}
          title="Undo last box"
        >
          <Undo2 className="h-3 w-3" />
          Undo
        </button>

        <button
          onClick={handleAuthorRedo}
          disabled={redoCount === 0}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${
            redoCount > 0
              ? "bg-slate-800 border-slate-600 text-slate-200"
              : "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
          }`}
          title="Redo last box"
        >
          <Redo2 className="h-3 w-3" />
          Redo
        </button>

        <button
          onClick={handleAuthorClearAll}
          disabled={totalAnnotationCount === 0}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${
            totalAnnotationCount > 0
              ? "bg-slate-800 border-slate-600 text-slate-200"
              : "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
          }`}
          title="Clear all boxes"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </button>

        <div className="w-px h-4 bg-slate-700" />

        <button
          onClick={handleCloseAuthoring}
          className="text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
          title="Exit annotate mode"
        >
          <X className="h-3 w-3" />
          Close
        </button>
      </div>
    );
  }

  if (participantSubmitted) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg backdrop-blur-sm">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-[10px] text-slate-300 whitespace-nowrap">Submitted</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg backdrop-blur-sm">
      <span className="text-[10px] text-slate-400 whitespace-nowrap">
        {annotationCount} box{annotationCount !== 1 ? "es" : ""}
      </span>

      <div className="w-px h-4 bg-slate-700" />

      <button
        onClick={handleAddBox}
        className="text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
        title="Draw a bounding box on the viewer"
      >
        <Plus className="h-3 w-3" />
        Add box
      </button>
    </div>
  );
}

export default AnnotationPanel;
export { AnnotationPanel };
