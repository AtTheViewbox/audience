import * as cornerstone from "@cornerstonejs/core";
import { rewriteImageUrl } from "../../../lib/inputParser.ts";
import { getImageIdForSlice } from "./builderUtils";

const thumbCache = new Map();

export function sampleSliceIndices(count, slots) {
  if (count <= 1) return [0];
  const n = Math.max(2, Math.min(count, Math.max(2, slots)));
  if (n >= count) return Array.from({ length: count }, (_, i) => i);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round((i * (count - 1)) / (n - 1)));
  }
  return [...new Set(out)];
}

export function nearestSampleIndex(index, samples) {
  if (!samples?.length) return index;
  let best = samples[0];
  let bestDist = Math.abs(index - best);
  for (const s of samples) {
    const d = Math.abs(index - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function voiByte(value, low, high) {
  if (high <= low) return 128;
  return Math.max(0, Math.min(255, Math.round(((value - low) / (high - low)) * 255)));
}

function firstNumber(value, fallback) {
  if (Array.isArray(value)) {
    const n = Number(value[0]);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function renderSliceThumb(imageId, { ww, wc, size = 64 } = {}) {
  if (!imageId) return null;
  const resolved = rewriteImageUrl(imageId);
  const key = `${resolved}|${Math.round(firstNumber(ww, 0))}|${Math.round(firstNumber(wc, 0))}|${size}`;
  if (thumbCache.has(key)) return thumbCache.get(key);

  let image = null;
  try {
    image = cornerstone.cache.getImage(resolved);
  } catch (_) {
    image = null;
  }
  if (!image) {
    image = await cornerstone.imageLoader.loadAndCacheImage(resolved);
  }
  const columns = image.columns || image.width;
  const rows = image.rows || image.height;
  if (!columns || !rows) return null;

  const pixels = image.getPixelData?.() || image.voxelManager?.getScalarData?.();
  if (!pixels) return null;
  const slope = firstNumber(image.slope, 1);
  const intercept = firstNumber(image.intercept, 0);
  const windowWidth = firstNumber(ww, 0) > 0
    ? firstNumber(ww, 400)
    : firstNumber(image.windowWidth, 400);
  const windowCenter = Number.isFinite(firstNumber(wc, NaN))
    ? firstNumber(wc, 40)
    : firstNumber(image.windowCenter, 40);
  const { lower, upper } = cornerstone.utilities.windowLevel.toLowHighRange(
    windowWidth,
    windowCenter
  );

  const scale = size / Math.max(columns, rows);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(columns * scale));
  canvas.height = Math.max(1, Math.round(rows * scale));
  const ctx = canvas.getContext("2d");
  const dest = ctx.createImageData(canvas.width, canvas.height);

  const isColor = Boolean(image.color || image.rgba);
  const spp = image.rgba ? 4 : image.color ? 3 : 1;

  for (let y = 0; y < canvas.height; y++) {
    const srcY = Math.min(rows - 1, Math.floor(y / scale));
    for (let x = 0; x < canvas.width; x++) {
      const srcX = Math.min(columns - 1, Math.floor(x / scale));
      const srcIndex = srcY * columns + srcX;
      const di = (y * canvas.width + x) * 4;
      if (isColor) {
        const si = srcIndex * spp;
        dest.data[di] = pixels[si];
        dest.data[di + 1] = pixels[si + 1];
        dest.data[di + 2] = pixels[si + 2];
        dest.data[di + 3] = 255;
      } else {
        const v = voiByte(pixels[srcIndex] * slope + intercept, lower, upper);
        dest.data[di] = v;
        dest.data[di + 1] = v;
        dest.data[di + 2] = v;
        dest.data[di + 3] = 255;
      }
    }
  }

  ctx.putImageData(dest, 0, 0);
  const url = canvas.toDataURL("image/jpeg", 0.72);
  thumbCache.set(key, url);
  if (thumbCache.size > 480) {
    thumbCache.delete(thumbCache.keys().next().value);
  }
  return url;
}

export function captureViewportThumb(root, size = 96) {
  const canvas = root?.querySelector?.("canvas");
  if (!canvas || canvas.width < 4 || canvas.height < 4) return null;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  const scale = Math.max(size / canvas.width, size / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  ctx.drawImage(canvas, (size - w) / 2, (size - h) / 2, w, h);
  try {
    return out.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

export function getResolvedImageId(metadata, index) {
  const id = getImageIdForSlice(metadata, index);
  return id ? rewriteImageUrl(id) : null;
}
