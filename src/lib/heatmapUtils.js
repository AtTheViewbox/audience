import { ensureOverlayState } from './medgemma-utils.js';

const OVERLAY_CLASS = 'annotation-heatmap';
const BLUR_PX = 12;
const MAX_ALPHA = 0.65;

function heatColor(t) {
    // 0 = transparent, low = blue, mid = yellow, high = red/white
    if (t <= 0) return [0, 0, 0, 0];
    const a = Math.round(MAX_ALPHA * 255 * Math.min(t, 1));
    if (t < 0.25) {
        const f = t / 0.25;
        return [0, 0, Math.round(200 * f), a];
    }
    if (t < 0.5) {
        const f = (t - 0.25) / 0.25;
        return [0, Math.round(220 * f), 200 - Math.round(100 * f), a];
    }
    if (t < 0.75) {
        const f = (t - 0.5) / 0.25;
        return [Math.round(255 * f), 220, Math.round(100 * (1 - f)), a];
    }
    const f = (t - 0.75) / 0.25;
    return [255, 220 - Math.round(100 * f), 0, a];
}

/**
 * Render a gradient heatmap of submitted bounding boxes on the given viewport.
 * Uses a pixel-level accumulator to produce a smooth gradient where more
 * overlapping boxes produce more intense (hotter) colors.
 */
export function renderBoxHeatmap(viewport, allBoxes) {
    const state = ensureOverlayState(viewport, OVERLAY_CLASS);
    if (!state) return;

    const { canvas } = state;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const currentImageId = viewport.getCurrentImageId?.();
    if (!currentImageId || !allBoxes || allBoxes.length === 0) return;

    const matchingBoxes = allBoxes.filter((b) => b.imageId === currentImageId);
    if (matchingBoxes.length === 0) return;

    // Build accumulator at canvas resolution
    const acc = new Uint16Array(w * h);
    let maxVal = 0;

    for (const box of matchingBoxes) {
        const pts = box.points;
        if (!pts || pts.length < 2) continue;

        const canvasPts = pts.map((p) => viewport.worldToCanvas(p));

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of canvasPts) {
            if (cx < minX) minX = cx;
            if (cy < minY) minY = cy;
            if (cx > maxX) maxX = cx;
            if (cy > maxY) maxY = cy;
        }

        const x0 = Math.max(0, Math.floor(minX));
        const y0 = Math.max(0, Math.floor(minY));
        const x1 = Math.min(w - 1, Math.ceil(maxX));
        const y1 = Math.min(h - 1, Math.ceil(maxY));

        for (let y = y0; y <= y1; y++) {
            const row = y * w;
            for (let x = x0; x <= x1; x++) {
                const v = ++acc[row + x];
                if (v > maxVal) maxVal = v;
            }
        }
    }

    if (maxVal === 0) return;

    // Render accumulator to ImageData with colormap
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let i = 0; i < w * h; i++) {
        if (acc[i] === 0) continue;
        const t = acc[i] / maxVal;
        const [r, g, b, a] = heatColor(t);
        const idx = i * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
    }

    // Draw to a temp canvas then blur onto the main canvas
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.putImageData(imgData, 0, 0);

    ctx.filter = `blur(${BLUR_PX}px)`;
    ctx.drawImage(tmpCanvas, 0, 0);
    ctx.filter = 'none';
}

export function clearBoxHeatmap(viewport) {
    const element = viewport?.element;
    if (!element) return;
    const container = element.querySelector(`.${OVERLAY_CLASS}`);
    if (container) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}

export function removeBoxHeatmap(viewport) {
    const element = viewport?.element;
    if (!element) return;
    const container = element.querySelector(`.${OVERLAY_CLASS}`);
    if (container) container.remove();
}
