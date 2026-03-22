import { useContext, useEffect, useRef, useCallback } from "react";
import { DataContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import {
  renderBoxHeatmap,
  clearBoxHeatmap,
  removeBoxHeatmap,
} from "../lib/heatmapUtils.js";

function HeatmapOverlay() {
  const { sessionId, sessionMeta, submittedAnnotations, renderingEngine, heatmapVisible } =
    useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;

  const renderingRef = useRef(null);
  renderingRef.current = renderingEngine;
  const prevHeatmapVisible = useRef(false);

  const submissionCount = Object.keys(submittedAnnotations || {}).length;
  const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;

  const allBoxes = useCallback(() => {
    const boxes = [];
    for (const userId of Object.keys(submittedAnnotations || {})) {
      const sub = submittedAnnotations[userId];
      if (sub?.boxes) {
        boxes.push(...sub.boxes);
      }
    }
    return boxes;
  }, [submittedAnnotations]);

  const renderAll = useCallback(() => {
    const engine = renderingRef.current;
    if (!engine) return;
    const boxes = allBoxes();
    const viewports = engine.getViewports();
    viewports.forEach((vp) => {
      if (boxes.length > 0) {
        renderBoxHeatmap(vp, boxes);
      } else {
        clearBoxHeatmap(vp);
      }
    });
  }, [allBoxes]);

  useEffect(() => {
    if (!isSessionOwner || submissionCount === 0 || !renderingEngine || !heatmapVisible) {
      prevHeatmapVisible.current = heatmapVisible;
      if (renderingEngine) {
        renderingEngine.getViewports().forEach((vp) => clearBoxHeatmap(vp));
      }
      return;
    }

    // Jump to the slice with the most annotations when heatmap is first shown
    if (heatmapVisible && !prevHeatmapVisible.current) {
      const boxes = allBoxes();
      if (boxes.length > 0) {
        const counts = {};
        for (const b of boxes) {
          if (b.imageId) counts[b.imageId] = (counts[b.imageId] || 0) + 1;
        }
        let bestId = null, bestCount = 0;
        for (const [id, c] of Object.entries(counts)) {
          if (c > bestCount) { bestId = id; bestCount = c; }
        }
        if (bestId) {
          const viewports = renderingEngine.getViewports();
          for (const vp of viewports) {
            const ids = vp.getImageIds?.();
            if (!ids) continue;
            const idx = ids.indexOf(bestId);
            if (idx !== -1) {
              vp.setImageIdIndex(idx);
              break;
            }
          }
        }
      }
    }
    prevHeatmapVisible.current = heatmapVisible;

    renderAll();

    const handler = () => requestAnimationFrame(renderAll);
    const viewports = renderingEngine.getViewports();
    const elements = viewports.map((vp) => vp.element).filter(Boolean);

    elements.forEach((el) => {
      el.addEventListener("CORNERSTONE_IMAGE_RENDERED", handler);
    });

    return () => {
      elements.forEach((el) => {
        el.removeEventListener("CORNERSTONE_IMAGE_RENDERED", handler);
      });
    };
  }, [isSessionOwner, submissionCount, renderingEngine, heatmapVisible, renderAll]);

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
