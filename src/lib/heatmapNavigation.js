import { normalizeImageId } from "./heatmapUtils.js";
import { findViewportForBox, imageIdsMatch } from "./answerKeyBoxes.js";

function dedupeBoxes(boxes) {
  const out = [];
  const seen = new Set();

  for (const box of boxes || []) {
    if (!box?.imageId || !box.points?.length) continue;
    const key = `${normalizeImageId(box.imageId)}:${JSON.stringify(box.points)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(box);
  }

  return out;
}

/** Participant submissions only — used to render the heatmap overlay. */
export function collectSubmissionHeatmapBoxes(submittedAnnotations) {
  const raw = [];
  for (const userId of Object.keys(submittedAnnotations || {})) {
    for (const box of submittedAnnotations[userId]?.boxes || []) raw.push(box);
  }
  return dedupeBoxes(raw);
}

/** Persisted answer-key boxes — shown on canvas with heatmap, not in heatmap density. */
export function collectAnswerKeyBoxes(persistedAnswerBoxes) {
  return dedupeBoxes(persistedAnswerBoxes);
}

export async function snapViewportToImage(renderingEngine, box) {
  if (!renderingEngine || !box?.imageId) return false;
  const vp = findViewportForBox(renderingEngine, box);
  if (!vp) return false;

  const ids = vp.getImageIds?.() || [];
  const idx = ids.findIndex((id) => imageIdsMatch(id, box.imageId));
  if (idx === -1) return false;

  await vp.setImageIdIndex(idx);
  vp.render?.();
  return true;
}

export async function snapToBoxAtIndex(renderingEngine, boxes, index) {
  if (!boxes?.length) return 0;
  const i = ((index % boxes.length) + boxes.length) % boxes.length;
  await snapViewportToImage(renderingEngine, boxes[i]);
  return i;
}

/** Jump to the slice with the most overlapping participant boxes (heatmap density). */
export async function snapToDensityPeak(renderingEngine, boxes) {
  if (!renderingEngine || !boxes?.length) return false;

  const counts = {};
  for (const b of boxes) {
    const key = normalizeImageId(b.imageId);
    if (key) counts[key] = (counts[key] || 0) + 1;
  }

  let bestKey = null;
  let bestCount = 0;
  for (const [key, c] of Object.entries(counts)) {
    if (c > bestCount) {
      bestKey = key;
      bestCount = c;
    }
  }
  if (!bestKey) return false;

  const viewports = renderingEngine.getViewports();
  for (const vp of viewports) {
    const ids = vp.getImageIds?.() || [];
    const idx = ids.findIndex((id) => normalizeImageId(id) === bestKey);
    if (idx !== -1) {
      await vp.setImageIdIndex(idx);
      vp.render?.();
      return true;
    }
  }
  return false;
}
