import { useContext, useEffect, useRef, useCallback } from "react";
import { DataContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import {
  renderBoxHeatmap,
  clearBoxHeatmap,
  removeBoxHeatmap,
} from "../lib/heatmapUtils.js";
import {
  collectSubmissionHeatmapBoxes,
  collectAnswerKeyBoxes,
  snapToBoxAtIndex,
} from "../lib/heatmapNavigation.js";
import { setPersistedBoxAnnotationsVisible } from "../lib/answerKeyBoxes.js";

function HeatmapOverlay() {
  const {
    sessionId,
    sessionMeta,
    submittedAnnotations,
    persistedAnswerBoxes,
    renderingEngine,
    heatmapVisible,
  } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;

  const renderingRef = useRef(null);
  renderingRef.current = renderingEngine;
  const prevHeatmapVisible = useRef(false);

  const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;

  const submissionBoxes = useCallback(
    () => collectSubmissionHeatmapBoxes(submittedAnnotations),
    [submittedAnnotations]
  );

  const renderAll = useCallback(() => {
    const engine = renderingRef.current;
    if (!engine) return;
    const boxes = submissionBoxes();
    engine.getViewports().forEach((vp) => {
      if (boxes.length > 0) {
        renderBoxHeatmap(vp, boxes);
      } else {
        clearBoxHeatmap(vp);
      }
    });
  }, [submissionBoxes]);

  useEffect(() => {
    if (!isSessionOwner || !renderingEngine || !sessionId) return;
    setPersistedBoxAnnotationsVisible(renderingEngine, heatmapVisible);
  }, [isSessionOwner, renderingEngine, sessionId, heatmapVisible]);

  useEffect(() => {
    if (!isSessionOwner || !renderingEngine || !heatmapVisible) {
      prevHeatmapVisible.current = heatmapVisible;
      if (renderingEngine) {
        renderingEngine.getViewports().forEach((vp) => clearBoxHeatmap(vp));
      }
      return;
    }

    let cancelled = false;

    const run = async () => {
      const answerBoxes = collectAnswerKeyBoxes(persistedAnswerBoxes);

      if (heatmapVisible && !prevHeatmapVisible.current && answerBoxes.length > 0) {
        await snapToBoxAtIndex(renderingEngine, answerBoxes, 0);
      }

      if (cancelled) return;
      prevHeatmapVisible.current = heatmapVisible;
      requestAnimationFrame(() => {
        if (!cancelled) renderAll();
      });
    };

    run();

    const handler = () => requestAnimationFrame(renderAll);
    const viewports = renderingEngine.getViewports();
    const elements = viewports.map((vp) => vp.element).filter(Boolean);

    elements.forEach((el) => {
      el.addEventListener("CORNERSTONE_IMAGE_RENDERED", handler);
      el.addEventListener("CORNERSTONE_STACK_NEW_IMAGE", handler);
    });

    return () => {
      cancelled = true;
      elements.forEach((el) => {
        el.removeEventListener("CORNERSTONE_IMAGE_RENDERED", handler);
        el.removeEventListener("CORNERSTONE_STACK_NEW_IMAGE", handler);
      });
    };
  }, [
    isSessionOwner,
    renderingEngine,
    heatmapVisible,
    renderAll,
    submissionBoxes,
    persistedAnswerBoxes,
  ]);

  useEffect(() => {
    if (!isSessionOwner || !heatmapVisible || !renderingEngine) return;
    renderAll();
  }, [submittedAnnotations, isSessionOwner, heatmapVisible, renderingEngine, renderAll]);

  useEffect(() => {
    return () => {
      if (renderingRef.current) {
        renderingRef.current
          .getViewports()
          .forEach((vp) => removeBoxHeatmap(vp));
      }
    };
  }, []);

  return null;
}

export default HeatmapOverlay;
