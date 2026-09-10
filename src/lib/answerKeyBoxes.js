import * as cornerstoneTools from "@cornerstonejs/tools";
import { normalizeImageId } from "./heatmapUtils.js";
import { applyAnnotationCaseFilter, isCaseLinked } from "./answerKeyCase.js";

export function imageIdsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return normalizeImageId(a) === normalizeImageId(b);
}

export function resolveViewportIndex(renderingEngine, imageId) {
  const viewports = renderingEngine?.getViewports?.() || [];
  for (let i = 0; i < viewports.length; i++) {
    const ids = viewports[i].getImageIds?.() || [];
    if (ids.some((id) => imageIdsMatch(id, imageId))) return i;
  }
  return 0;
}

/** Pick the viewport whose stack contains this box's slice. */
export function findViewportForBox(renderingEngine, box) {
  if (!renderingEngine || !box?.imageId) return null;
  const viewports = renderingEngine.getViewports();
  const preferred = box.viewportIndex;

  if (preferred != null && viewports[preferred]) {
    const vp = viewports[preferred];
    const ids = vp.getImageIds?.() || [];
    if (ids.some((id) => imageIdsMatch(id, box.imageId))) return vp;
  }

  for (const vp of viewports) {
    const ids = vp.getImageIds?.() || [];
    if (ids.some((id) => imageIdsMatch(id, box.imageId))) return vp;
  }

  return null;
}

export function newAnnotationUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildRectangleAnnotation(box, rowId) {
  return {
    annotationUID: newAnnotationUid(),
    highlighted: false,
    invalidated: true,
    isLocked: true,
    isVisible: true,
    answerKeySaved: true,
    answerKeyRowId: rowId,
    metadata: {
      toolName: "RectangleROI",
      viewPlaneNormal: box.viewPlaneNormal,
      viewUp: box.viewUp,
      FrameOfReferenceUID: box.FrameOfReferenceUID,
      referencedImageId: box.imageId,
    },
    data: {
      handles: {
        points: box.points,
        activeHandleIndex: null,
        textBox: {
          hasMoved: false,
          worldPosition: [0, 0, 0],
          worldBoundingBox: {
            topLeft: [0, 0, 0],
            topRight: [0, 0, 0],
            bottomLeft: [0, 0, 0],
            bottomRight: [0, 0, 0],
          },
        },
      },
      cachedStats: {},
      label: "",
    },
  };
}

export function flattenBoxRows(rows) {
  const flat = [];
  for (const row of rows || []) {
    if (row.kind !== "box") continue;
    for (const box of row.boxes || []) {
      if (!box?.imageId || !box.points?.length) continue;
      flat.push({
        rowId: row.id,
        imageId: box.imageId,
        points: box.points,
        viewportIndex: box.viewportIndex,
        viewPlaneNormal: box.viewPlaneNormal,
        viewUp: box.viewUp,
        FrameOfReferenceUID: box.FrameOfReferenceUID,
      });
    }
  }
  return flat;
}

export async function fetchBoxAnnotationRows(supabaseClient, caseLink, userId) {
  if (!supabaseClient || !isCaseLinked(caseLink)) return [];
  if (!caseLink.studyId && !userId) return [];

  let query = supabaseClient
    .from("series_annotations")
    .select("*")
    .eq("kind", "box")
    .order("created_at", { ascending: true });

  query = applyAnnotationCaseFilter(query, { ...caseLink, userId });
  if (!query) return [];

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function restoreBoxRows(renderingEngine, rows, { replaceExisting = false } = {}) {
  if (!renderingEngine) return 0;

  const mgr = cornerstoneTools.annotation.state;
  let restored = 0;

  if (replaceExisting) {
    mgr
      .getAllAnnotations()
      .filter((a) => a.answerKeyRowId)
      .forEach((a) => mgr.removeAnnotation(a.annotationUID));
  }

  for (const row of rows || []) {
    if (row.kind !== "box") continue;

    for (const box of row.boxes || []) {
      if (
        !replaceExisting &&
        row.id &&
        mgr.getAllAnnotations().some((a) => a.answerKeyRowId === row.id)
      ) {
        continue;
      }

      const vp = findViewportForBox(renderingEngine, box);
      if (!vp?.element) continue;

      mgr.addAnnotation(buildRectangleAnnotation(box, row.id), vp.element);
      restored++;
    }
  }

  if (restored > 0) renderingEngine.render();
  return restored;
}

export function boxesArePlaced(renderingEngine, rows) {
  if (!renderingEngine || !rows?.length) return true;
  const mgr = cornerstoneTools.annotation.state;
  return rows.every(
    (row) =>
      row.kind !== "box" ||
      !row.boxes?.length ||
      mgr.getAllAnnotations().some((a) => a.answerKeyRowId === row.id)
  );
}

export function removeBoxRowFromCanvas(renderingEngine, rowId) {
  if (!renderingEngine || !rowId) return;
  const mgr = cornerstoneTools.annotation.state;
  mgr
    .getAllAnnotations()
    .filter((a) => a.answerKeyRowId === rowId)
    .forEach((a) => mgr.removeAnnotation(a.annotationUID));
  renderingEngine.render();
}

export function viewportsHaveStacks(renderingEngine) {
  const viewports = renderingEngine?.getViewports?.() || [];
  if (viewports.length === 0) return false;
  return viewports.some((vp) => (vp.getImageIds?.() || []).length > 0);
}

/** Show/hide persisted answer-key rectangles on the canvas (tied to heatmap in share sessions). */
export function setPersistedBoxAnnotationsVisible(renderingEngine, visible) {
  if (!renderingEngine) return;
  const mgr = cornerstoneTools.annotation.state;
  let changed = false;

  mgr.getAllAnnotations().forEach((a) => {
    if (
      a.metadata?.toolName === "RectangleROI" &&
      (a.answerKeyRowId || a.answerKeySaved)
    ) {
      if (a.isVisible !== visible) {
        a.isVisible = visible;
        changed = true;
      }
    }
  });

  if (changed) renderingEngine.render();
}
