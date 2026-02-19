
// --- RLE (pairs) -> ImageData tinted overlay ---
// RLE format assumed: [start,len,start,len,...] where start is a pixel index in [0..W*H)
// Pixel index is row-major: p = y*W + x
export function rlePairsToImageData(rlePairs, W, H, rgba = [0, 255, 0, 120]) {
    const imgData = new ImageData(W, H);
    const data = imgData.data;

    if (!Array.isArray(rlePairs) || rlePairs.length < 2) return imgData;

    for (let i = 0; i < rlePairs.length; i += 2) {
        const start = rlePairs[i] | 0;
        const len = rlePairs[i + 1] | 0;
        if (len <= 0) continue;

        const end = start + len;
        for (let p = start; p < end; p++) {
            if (p < 0 || p >= W * H) continue;
            const idx = p * 4;
            data[idx] = rgba[0];
            data[idx + 1] = rgba[1];
            data[idx + 2] = rgba[2];
            data[idx + 3] = rgba[3];
        }
    }

    return imgData;
}

export function ensureOverlayState(viewport, overlayClass = 'medgemma-overlay') {
    const element = viewport?.element;
    if (!element) return null;

    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    let container = element.querySelector(`.${overlayClass}`);
    if (!container) {
        container = document.createElement('div');
        container.className = overlayClass;
        Object.assign(container.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '10',
            display: 'block',
        });
        element.appendChild(container);
    }

    let canvas = container.querySelector('canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        Object.assign(canvas.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
        });
        container.appendChild(canvas);
    }

    return { element, container, canvas };
}

export function setMaskOverlayVisible(viewport, visible, overlayClass = 'medgemma-overlay') {
    const element = viewport?.element;
    if (!element) return;
    const container = element.querySelector(`.${overlayClass}`);
    if (container) container.style.display = visible ? 'block' : 'none';
}

export function clearMaskOverlay(viewport, overlayClass = 'medgemma-overlay') {
    const element = viewport?.element;
    if (!element) return;

    // Unregister this overlay's render function from the master dispatcher
    if (element.__rleHandlers) {
        delete element.__rleHandlers[overlayClass];

        // If no overlays remain, tear down the master event listener
        if (Object.keys(element.__rleHandlers).length === 0) {
            if (element.__rleMasterDispatch) {
                element.removeEventListener('cornerstoneimagerendered', element.__rleMasterDispatch);
                element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', element.__rleMasterDispatch);
                delete element.__rleMasterDispatch;
            }
            delete element.__rleHandlers;
        }
    }

    // Remove per-overlay cached data
    if (element.__rleOverlays) {
        delete element.__rleOverlays[overlayClass];
    }

    // Remove DOM
    element.querySelectorAll(`.${overlayClass}`).forEach(el => el.remove());
}


export function sliceBinary_ZYX(volumeRlePairs, W, H, D, zWanted, opts = {}) {
    const {
        xyOrder = 'xMajor',
        flipX = false,
        flipY = false,
        flipZ = false,
        zOffset = 0,
    } = opts;

    const seen = new Uint8Array(W * H);

    // Map zWanted if flipZ is active, applying any nudge
    const shiftedZ = zWanted + zOffset;
    const targetZ = flipZ ? (D - 1 - shiftedZ) : shiftedZ;

    for (let i = 0; i < volumeRlePairs.length; i += 2) {
        const start = volumeRlePairs[i] | 0;
        const len = volumeRlePairs[i + 1] | 0;
        if (len <= 0) continue;

        const end = start + len;

        for (let p = start; p < end; p++) {
            const z = p % D;
            if (z !== targetZ) continue;

            const t = (p - z) / D; // flattened 2D index
            if (t < 0 || t >= W * H) continue;

            let x, y;

            if (xyOrder === 'yMajor') {
                // t = y*W + x
                x = t % W;
                y = (t / W) | 0;
            } else {
                // xyOrder === 'xMajor'
                // t = x*H + y
                y = t % H;
                x = (t / H) | 0;
            }

            if (flipX) x = (W - 1) - x;
            if (flipY) y = (H - 1) - y;

            const idx = y * W + x;
            if (idx >= 0 && idx < W * H) seen[idx] = 1;
        }
    }

    return seen;
}

export function binaryToRlePairs(seen) {
    const out = [];
    let runStart = -1;
    for (let i = 0; i < seen.length; i++) {
        if (seen[i]) {
            if (runStart === -1) runStart = i;
        } else {
            if (runStart !== -1) {
                out.push(runStart, i - runStart);
                runStart = -1;
            }
        }
    }
    if (runStart !== -1) out.push(runStart, seen.length - runStart);
    return out;
}

// Small helper: hex -> rgb
export function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

export function extractInstanceNumber(str) {
    if (!str) return null;
    const match = str.match(/(\d+)(?!.*\d)/); // Last sequence of digits
    return match ? parseInt(match[0], 10) : null;
}

export function drawRleMaskOverlay({
    viewport,
    volumeMaskRle,          // full 3D RLE from backend
    shape,                  // [W,H,D]
    overlayClass = 'medgemma-overlay',
    colorHex = '#00ff00',
    alpha = 140,

    // orientation knobs
    xyOrder = 'xMajor',
    flipX = false,
    flipY = false,
    flipZ = false,
    zOffset = 0,
    halfPixel = true,

    debug = false,
}) {
    const element = viewport?.element;
    if (!element) return;

    if (!Array.isArray(volumeMaskRle) || volumeMaskRle.length < 2) {
        console.warn('[RLE overlay] volumeMaskRle missing/empty');
        return;
    }
    if (!shape || shape.length !== 3) {
        console.warn('[RLE overlay] shape missing/invalid:', shape);
        return;
    }

    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    const imageIds = viewport.getImageIds?.() || [];
    if (!imageIds.length) {
        console.warn('[RLE overlay] viewport has no imageIds');
        return;
    }

    const state = ensureOverlayState(viewport, overlayClass);
    if (!state) return;

    const { element: vpEl, container, canvas: overlayCanvas } = state;
    const overlayCtx = overlayCanvas.getContext('2d');

    // ── Per-overlay data (keyed by overlayClass) ─────────────────────────────
    vpEl.__rleOverlays = vpEl.__rleOverlays || {};
    let ovData = vpEl.__rleOverlays[overlayClass];

    const nextSig = `${shape.join('x')}_${volumeMaskRle.length}_${volumeMaskRle[0]}_${volumeMaskRle[1]}`;
    const nextOpts = { xyOrder, flipX, flipY, flipZ, zOffset };

    if (!ovData || ovData._sig !== nextSig) {
        ovData = { _sig: nextSig, cache2D: {}, opts: nextOpts };
    } else if (JSON.stringify(ovData.opts) !== JSON.stringify(nextOpts)) {
        ovData.cache2D = {};
        ovData.opts = nextOpts;
    } else {
        ovData.opts = nextOpts;
    }

    ovData.volumeMaskRle = volumeMaskRle;
    ovData.shape = shape;
    ovData.imageIds = imageIds;
    vpEl.__rleOverlays[overlayClass] = ovData;

    // ── Render function for THIS overlay ─────────────────────────────────────
    const renderOnce = () => {
        // Per-overlay visibility: check if this container is hidden
        if (container.style.display === 'none') return;

        const cw = vpEl.clientWidth;
        const ch = vpEl.clientHeight;
        if (!cw || !ch) return;

        if (overlayCanvas.width !== cw) overlayCanvas.width = cw;
        if (overlayCanvas.height !== ch) overlayCanvas.height = ch;

        overlayCtx.clearRect(0, 0, cw, ch);

        const imageData = viewport.getImageData?.();
        if (!imageData) return;

        const { direction, spacing, origin, dimensions } = imageData;
        const imgW = dimensions?.[0];
        const imgH = dimensions?.[1];
        if (!imgW || !imgH) return;

        const D = shape[2];
        const z = viewport.getCurrentImageIdIndex();
        if (z < 0 || z >= D) return;

        const myData = vpEl.__rleOverlays?.[overlayClass];
        if (!myData) return;

        let maskImgData = myData.cache2D[z];
        if (!maskImgData) {
            const o = myData.opts || { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: 1 };
            const seen = sliceBinary_ZYX(volumeMaskRle, imgW, imgH, D, z, {
                xyOrder: o.xyOrder, flipX: o.flipX, flipY: o.flipY, flipZ: o.flipZ, zOffset: o.zOffset,
            });
            const rle2D = binaryToRlePairs(seen);
            const { r, g, b } = hexToRgb(colorHex);
            maskImgData = rlePairsToImageData(rle2D, imgW, imgH, [r, g, b, alpha]);
            myData.cache2D[z] = maskImgData;
        }

        const getCanvasCoord = (x, y) => {
            const world = [
                origin[0] + x * spacing[0] * direction[0] + y * spacing[1] * direction[3],
                origin[1] + x * spacing[0] * direction[1] + y * spacing[1] * direction[4],
                origin[2] + x * spacing[0] * direction[2] + y * spacing[1] * direction[5],
            ];
            return viewport.worldToCanvas(world);
        };

        const px = halfPixel ? 0.5 : 0;
        const topLeft = getCanvasCoord(0 + px, 0 + px);
        const topRight = getCanvasCoord(imgW - px, 0 + px);
        const bottomLeft = getCanvasCoord(0 + px, imgH - px);

        const canvasX = topLeft[0];
        const canvasY = topLeft[1];
        const canvasW = topRight[0] - topLeft[0];
        const canvasH = bottomLeft[1] - topLeft[1];

        if (debug) {
            overlayCtx.save();
            overlayCtx.strokeStyle = 'rgba(255,0,0,0.9)';
            overlayCtx.lineWidth = 2;
            overlayCtx.strokeRect(canvasX, canvasY, canvasW, canvasH);
            overlayCtx.restore();
        }

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgW;
        sliceCanvas.height = imgH;
        const sliceCtx = sliceCanvas.getContext('2d');
        sliceCtx.putImageData(maskImgData, 0, 0);

        overlayCtx.drawImage(sliceCanvas, 0, 0, imgW, imgH, canvasX, canvasY, canvasW, canvasH);
    };

    // ── Master event dispatcher (shared across all overlays) ─────────────────
    // One event listener calls every registered overlay's render function.
    element.__rleHandlers = element.__rleHandlers || {};
    element.__rleHandlers[overlayClass] = renderOnce;

    if (!element.__rleMasterDispatch) {
        const dispatch = () => {
            requestAnimationFrame(() => {
                const handlers = element.__rleHandlers;
                if (!handlers) return;
                for (const key in handlers) {
                    handlers[key]();
                }
            });
        };
        element.__rleMasterDispatch = dispatch;
        element.addEventListener('cornerstoneimagerendered', dispatch);
        element.addEventListener('CORNERSTONE_IMAGE_RENDERED', dispatch);
    }

    // initial render
    renderOnce();

    return () => {
        if (element.__rleHandlers) {
            delete element.__rleHandlers[overlayClass];
            if (Object.keys(element.__rleHandlers).length === 0 && element.__rleMasterDispatch) {
                element.removeEventListener('cornerstoneimagerendered', element.__rleMasterDispatch);
                element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', element.__rleMasterDispatch);
                delete element.__rleMasterDispatch;
                delete element.__rleHandlers;
            }
        }
        element.querySelectorAll(`.${overlayClass}`).forEach(el => el.remove());
        if (vpEl.__rleOverlays) delete vpEl.__rleOverlays[overlayClass];
    };
}
