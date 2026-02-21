import { useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { DataContext, DataDispatchContext } from '../../context/DataContext';
import { Link, Unlink } from 'lucide-react';
import {
    drawRleMaskOverlay,
    setMaskOverlayVisible,
    clearMaskOverlay,
} from '../../lib/medgemma-utils';

const MASK_COLORS = [
    '#22c55e', '#f87171', '#38bdf8', '#fbbf24', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#34d399',
];

function friendlyLabel(structure) {
    const map = {
        lung_upper_lobe_right: 'R Upper Lobe', lung_middle_lobe_right: 'R Middle Lobe',
        lung_lower_lobe_right: 'R Lower Lobe', lung_upper_lobe_left: 'L Upper Lobe',
        lung_lower_lobe_left: 'L Lower Lobe', kidney_right: 'R Kidney',
        kidney_left: 'L Kidney', adrenal_gland_right: 'R Adrenal',
        adrenal_gland_left: 'L Adrenal',
    };
    if (map[structure]) return map[structure];
    return structure.replace(/_/g, ' ').replace(/\bright\b/gi, 'R').replace(/\bleft\b/gi, 'L')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export default function CompareNormal() {
    const { data } = useContext(DataContext);
    const { dispatch } = useContext(DataDispatchContext);
    const { renderingEngine, compareNormal, lastSegmentation } = data;

    const cleanupRef = useRef(null);
    const [maskToggles, setMaskToggles] = useState([]);
    const [isSynced, setIsSynced] = useState(true);
    const isActive = !!compareNormal?.active;

    const getSliceSpacing = useCallback((vp) => {
        const ids = vp.getImageIds();
        if (ids.length < 2) return null;
        try {
            const m0 = cornerstone.metaData.get('imagePlaneModule', ids[0]);
            const m1 = cornerstone.metaData.get('imagePlaneModule', ids[1]);
            if (m0?.imagePositionPatient && m1?.imagePositionPatient) {
                const [x0, y0, z0] = m0.imagePositionPatient;
                const [x1, y1, z1] = m1.imagePositionPatient;
                return Math.abs(Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2)) || null;
            }
        } catch (_) { }
        return null;
    }, []);

    // ── Build per-structure toggle list when comparison activates ─────────────
    useEffect(() => {
        if (!isActive || !compareNormal?.normalMaskDataList) {
            setMaskToggles([]);
            return;
        }

        const structures = lastSegmentation?.results || [];
        const normalMasks = compareNormal.normalMaskDataList;

        const toggles = normalMasks.map((normMask, i) => {
            const patResult = structures[i];
            const structureName = patResult?.structure || normMask.structure || `Structure ${i + 1}`;
            return {
                structure: structureName,
                label: friendlyLabel(structureName),
                color: MASK_COLORS[i % MASK_COLORS.length],
                patientOverlay: `medgemma-mask-${i}`,
                normalOverlay: `compare-normal-mask-${i}`,
                visible: true,
            };
        });

        setMaskToggles(toggles);
    }, [isActive, compareNormal?.normalMaskDataList, lastSegmentation?.results]);

    // ── Lock reference viewport + apply masks + set up one-way sync ───────────
    useEffect(() => {
        if (!isActive || !renderingEngine || !compareNormal) return;

        let cancelled = false;
        let attempts = 0;
        const maxAttempts = 80;
        let refEl = null;
        let patEl = null;
        let voiInterval = null;

        const blocker = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

        const pushPatientVoi = (patientVp, refVp) => {
            try {
                // Ensure the exact desired ref volume slice is fully loaded in memory
                const refImageId = refVp.getCurrentImageId();
                if (!refImageId) return;

                const refImg = cornerstone.cache.getImage(refImageId);
                if (!refImg) {
                    // It hasn't finished hitting the network/cache yet. 
                    // Do not push VOI—cornerstone would incorrectly apply it to the fallback rendering state.
                    return;
                }

                // Push properties natively. Cornerstone 3D correctly processes Modality LUTs internally.
                const props = patientVp.getProperties();
                if (props && props.voiRange) {
                    refVp.setProperties({
                        voiRange: props.voiRange,
                        invert: props.invert ?? false,
                        isComputedVOI: false
                    });
                    refVp.render();
                }
            } catch (err) {
                console.warn('Sync VOI failed:', err);
            }
        };

        const setup = async () => {
            if (cancelled) return;
            const patientVp = renderingEngine.getViewport('0-vp');
            const refVp = renderingEngine.getViewport('1-vp');
            if (!patientVp || !refVp || !refVp.getImageIds?.()?.length) {
                if (++attempts < maxAttempts) setTimeout(setup, 250);
                return;
            }

            // ── 1. Apply masks to reference ──────────────────────────────────
            const maskDataList = compareNormal.normalMaskDataList || [];
            maskDataList.forEach((maskData, i) => {
                const xform = getMaskTransform(maskData.orientation);
                const cls = `compare-normal-mask-${i}`;
                clearMaskOverlay(refVp, cls);
                drawRleMaskOverlay({
                    viewport: refVp,
                    volumeMaskRle: maskData.mask_rle,
                    shape: maskData.shape,
                    overlayClass: cls,
                    colorHex: MASK_COLORS[i % MASK_COLORS.length],
                    ...xform,
                });
                setMaskOverlayVisible(refVp, true, cls);
            });

            if (!isSynced) {
                cleanupRef.current = () => {
                    if (voiInterval) clearInterval(voiInterval);
                    maskDataList.forEach((_, i) => {
                        clearMaskOverlay(refVp, `compare-normal-mask-${i}`);
                    });
                };
                return;
            }

            // ── 2. Lock reference viewport ───────────────────────────────────
            refEl = refVp.element;
            if (refEl) {
                refEl.dataset.voiSynced = 'true';
                refEl.addEventListener('wheel', blocker, { capture: true, passive: false });
                refEl.addEventListener('mousedown', blocker, { capture: true });
                refEl.addEventListener('touchstart', blocker, { capture: true });
            }

            // ── 3. Compute centroids + spacing for linear mapping ────────────
            const patCentroid = compareNormal.patientCentroidSlice ?? 0;
            const normCentroid = compareNormal.normalCentroidSlice ?? 0;

            const patSpacing = getSliceSpacing(patientVp);
            const normSpacing = getSliceSpacing(refVp);
            const ratio = (patSpacing && normSpacing && normSpacing > 0)
                ? (patSpacing / normSpacing)
                : 1;

            // ── 4. Navigate reference to centroid + push patient VOI ─────────
            const refImages = refVp.getImageIds();
            const patIdx = patientVp.getCurrentImageIdIndex();
            const syncNormalIdx = Math.round(normCentroid + (patIdx - patCentroid) * ratio);
            const clampedCentroid = Math.max(0, Math.min(syncNormalIdx, refImages.length - 1));

            try {
                // Ensure the exact target slice is fully downloaded into memory BEFORE we navigate to it
                // This prevents Cornerstone from asynchronously computing an inverted VOI when the image finally resolves
                await cornerstone.imageLoader.loadAndCacheImage(refImages[clampedCentroid]);
            } catch (err) {
                console.warn('Preload failed for centroid target:', err);
            }

            if (cancelled) return;

            refVp.setImageIdIndex(clampedCentroid);
            pushPatientVoi(patientVp, refVp);
            refVp.render();

            // Aggressively enforce patient VOI during initial load period.
            // Cornerstone auto-computes VOI from DICOM metadata when pixels
            // arrive async — this interval overrides it until things settle.
            voiInterval = setInterval(() => {
                if (cancelled) { clearInterval(voiInterval); return; }
                pushPatientVoi(patientVp, refVp);
            }, 150);
            setTimeout(() => { clearInterval(voiInterval); voiInterval = null; }, 4000);

            // ── 5. One-way scroll + VOI sync (patient → reference) ───────────
            const syncToRef = () => {
                const patIdx = patientVp.getCurrentImageIdIndex();
                const normalIdx = Math.round(
                    normCentroid + (patIdx - patCentroid) * ratio
                );
                const clamped = Math.max(0, Math.min(normalIdx, refImages.length - 1));

                if (refVp.getCurrentImageIdIndex() !== clamped) {
                    refVp.setImageIdIndex(clamped);
                }
                pushPatientVoi(patientVp, refVp);
            };

            const enforceVoiOnRef = () => {
                pushPatientVoi(patientVp, refVp);
            };

            const syncVoiOnly = () => {
                pushPatientVoi(patientVp, refVp);
            };

            patEl = patientVp.element;
            patEl?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', syncToRef);
            patEl?.addEventListener('CORNERSTONE_VOI_MODIFIED', syncVoiOnly);
            refEl?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', enforceVoiOnRef);

            syncToRef();

            cleanupRef.current = () => {
                if (voiInterval) clearInterval(voiInterval);
                patEl?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', syncToRef);
                patEl?.removeEventListener('CORNERSTONE_VOI_MODIFIED', syncVoiOnly);
                refEl?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', enforceVoiOnRef);
                if (refEl) {
                    refEl.removeEventListener('wheel', blocker, true);
                    refEl.removeEventListener('mousedown', blocker, true);
                    refEl.removeEventListener('touchstart', blocker, true);
                    delete refEl.dataset.voiSynced;
                }
                maskDataList.forEach((_, i) => {
                    clearMaskOverlay(refVp, `compare-normal-mask-${i}`);
                });
            };
        };

        setup();

        return () => {
            cancelled = true;
            if (voiInterval) clearInterval(voiInterval);
            cleanupRef.current?.();
        };
    }, [isActive, renderingEngine, compareNormal, getSliceSpacing, isSynced]);

    // ── Deactivate comparison ─────────────────────────────────────────────────
    const deactivateCompare = useCallback(() => {
        cleanupRef.current?.();
        dispatch({ type: 'deactivate_compare_normal' });
    }, [dispatch]);

    // ── Hotkey (N key) ────────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                e.target.isContentEditable) return;
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                if (isActive) deactivateCompare();
                else {
                    dispatch({ type: 'request_compare_normal' });
                    window.dispatchEvent(new CustomEvent('medgemma-open-chat'));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, deactivateCompare, dispatch]);

    // ── Per-structure mask toggle ─────────────────────────────────────────────
    const toggleStructureMask = useCallback((index) => {
        if (!renderingEngine) return;
        setMaskToggles(prev => {
            const updated = [...prev];
            const t = updated[index];
            const next = !t.visible;
            updated[index] = { ...t, visible: next };

            const patVp = renderingEngine.getViewport('0-vp');
            const refVp = renderingEngine.getViewport('1-vp');

            if (patVp) {
                setMaskOverlayVisible(patVp, next, t.patientOverlay);
                patVp.element?.__rleRenderOnce?.();
            }
            if (refVp) {
                setMaskOverlayVisible(refVp, next, t.normalOverlay);
            }

            return updated;
        });
    }, [renderingEngine]);

    // ── Badge overlay ─────────────────────────────────────────────────────────
    if (!isActive) return null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg backdrop-blur-sm">

            <button
                onClick={() => setIsSynced(!isSynced)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${isSynced
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                title="Toggle Sync"
            >
                {isSynced ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
                {isSynced ? 'Synced' : 'Independent'}
            </button>

            <div className="w-px h-4 bg-slate-700" />
            {maskToggles.map((t, i) => (
                <button
                    key={t.structure}
                    onClick={() => toggleStructureMask(i)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${t.visible
                        ? 'bg-slate-800 border-slate-600 text-slate-200'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                >
                    <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.visible ? t.color : '#475569' }}
                    />
                    {t.label}
                </button>
            ))}

            <button
                onClick={deactivateCompare}
                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors font-medium"
            >
                Close (N)
            </button>
        </div>
    );
}

function getMaskTransform(orientation) {
    switch (orientation) {
        case 'coronal':
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
        case 'sagittal':
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
        case 'axial':
        default:
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
    }
}
