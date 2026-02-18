
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

    // anchor
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    // container
    let container = element.querySelector(`.${overlayClass}`);
    if (!container) {
        container = document.createElement('div');
        container.className = overlayClass;
        Object.assign(container.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '10',
        });
        element.appendChild(container);
    }

    // single canvas
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

    // default visibility flag stored on element (persists)
    if (typeof element.__maskVisible !== 'boolean') element.__maskVisible = true;

    // apply current visibility
    container.style.display = element.__maskVisible ? 'block' : 'none';

    return { element, container, canvas };
}

export function setMaskOverlayVisible(viewport, visible, overlayClass = 'medgemma-overlay') {
    const element = viewport?.element;
    if (!element) return;
    element.__maskVisible = !!visible;
    const container = element.querySelector(`.${overlayClass}`);
    if (container) container.style.display = visible ? 'block' : 'none';
}

export function clearMaskOverlay(viewport, overlayClass = 'medgemma-overlay') {
    const element = viewport?.element;
    if (!element) return;

    // remove render listeners
    if (element.__rleRenderHandler) {
        element.removeEventListener('cornerstoneimagerendered', element.__rleRenderHandler);
        element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', element.__rleRenderHandler);
        delete element.__rleRenderHandler;
    }

    // remove DOM
    element.querySelectorAll(`.${overlayClass}`).forEach(el => el.remove());

    // clear stored data
    delete element.__rleSeriesData;
    delete element.__maskVisible;
    delete element.__rleRenderOnce;
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
    shape,                  // [W,H,D] or [H,W,D] — we’ll handle both if W/H match 512
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

    // Ensure absolute overlay anchors correctly
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    const imageIds = viewport.getImageIds?.() || [];
    if (!imageIds.length) {
        console.warn('[RLE overlay] viewport has no imageIds');
        return;
    }
    // ensure overlay exists
    const state = ensureOverlayState(viewport, overlayClass);
    if (!state) return;

    const { element: vpEl, canvas: overlayCanvas } = state;
    const overlayCtx = overlayCanvas.getContext('2d');

    // Persist series data ONCE per segmentation run.
    // Only reset cache if the incoming volumeMaskRle changed.
    vpEl.__rleSeriesData = vpEl.__rleSeriesData || {};

    const prevSig = vpEl.__rleSeriesData._sig;
    const nextSig = `${shape?.join('x') || 'noShape'}_${volumeMaskRle.length}_${volumeMaskRle[0]}_${volumeMaskRle[1]}`;

    if (prevSig !== nextSig) {
        // new segmentation -> reset cache
        vpEl.__rleSeriesData.cache2D = {};
        vpEl.__rleSeriesData._sig = nextSig;
    }

    vpEl.__rleSeriesData.volumeMaskRle = volumeMaskRle;
    vpEl.__rleSeriesData.shape = shape;
    vpEl.__rleSeriesData.imageIds = imageIds;

    // IMPORTANT: store latest opts (this is what your buttons update)
    const nextOpts = { xyOrder, flipX, flipY, flipZ, zOffset };
    const prevOpts = vpEl.__rleSeriesData.opts;

    // If options changed, clear cache
    if (JSON.stringify(prevOpts) !== JSON.stringify(nextOpts)) {
        vpEl.__rleSeriesData.cache2D = {};
    }
    vpEl.__rleSeriesData.opts = nextOpts;

    const renderOnce = () => {
        // Use vpEl consistently
        if (vpEl.__maskVisible === false) {
            // hidden: still keep handler active but don’t draw
            return;
        }
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

        // D from backend shape
        const D = shape[2];

        // current z from viewport index
        const z = viewport.getCurrentImageIdIndex();
        if (z < 0 || z >= D) {
            if (debug) console.warn('[RLE overlay] z out of range', { z, D });
            return;
        }

        // Build cached mask ImageData for this z
        let maskImgData = vpEl.__rleSeriesData.cache2D[z];
        if (!maskImgData) {
            const opts = vpEl.__rleSeriesData?.opts || { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: 1 };
            const { xyOrder, flipX: fX, flipY: fY, flipZ: fZ, zOffset: zO } = opts;

            const seen = sliceBinary_ZYX(volumeMaskRle, imgW, imgH, D, z, {
                xyOrder,
                flipX: fX,
                flipY: fY,
                flipZ: fZ,
                zOffset: zO,
            });
            const rle2D = binaryToRlePairs(seen);
            const { r, g, b } = hexToRgb(colorHex);
            maskImgData = rlePairsToImageData(rle2D, imgW, imgH, [r, g, b, alpha]);
            vpEl.__rleSeriesData.cache2D[z] = maskImgData;

            if (debug) {
                console.log('[mask cache] slice', z, 'runs', rle2D.length / 2, 'sample', rle2D.slice(0, 10));
            }
        }

        // Map image pixels -> canvas rect using worldToCanvas
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

        // Draw mask
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgW;
        sliceCanvas.height = imgH;
        const sliceCtx = sliceCanvas.getContext('2d');
        sliceCtx.putImageData(maskImgData, 0, 0);

        overlayCtx.drawImage(sliceCanvas, 0, 0, imgW, imgH, canvasX, canvasY, canvasW, canvasH);
    };

    // Allow external force-redraw without relying on cornerstone events
    vpEl.__rleRenderOnce = renderOnce;

    // initial render
    renderOnce();

    // re-render on cornerstone events
    const handleRender = () => requestAnimationFrame(renderOnce);

    if (element.__rleRenderHandler) {
        element.removeEventListener('cornerstoneimagerendered', element.__rleRenderHandler);
        element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', element.__rleRenderHandler);
    }

    element.__rleRenderHandler = handleRender;
    element.addEventListener('cornerstoneimagerendered', handleRender);
    element.addEventListener('CORNERSTONE_IMAGE_RENDERED', handleRender);

    return () => {
        element.removeEventListener('cornerstoneimagerendered', handleRender);
        element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', handleRender);
        element.querySelectorAll(`.${overlayClass}`).forEach(el => el.remove());
        delete element.__rleRenderHandler;
        delete vpEl.__rleRenderOnce;
        delete element.__rleSeriesData;
    };
}
