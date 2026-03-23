import { useState, useEffect, useContext, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { DataContext } from '../../context/DataContext';
import { Layers, Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    drawRleMaskOverlay,
    setMaskOverlayVisible,
    clearMaskOverlay,
} from '../../lib/medgemma-utils';

const BASE_URL = import.meta.env.VITE_MEDGEMMA_API_URL || 'https://mfei1225--medgemma-dual-agent-v11-api.modal.run';

const PANEL_W = 256;
const OPEN_MS = 380;
const CLOSE_MS = 320;
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Icon uses same duration as panel open so one continuous motion (not expand-then-slide). */
const TITLE_DELAY_MS = OPEN_MS + 48; // title after open motion (avoids header width jump mid-slide)
const MENU_DELAY_MS = TITLE_DELAY_MS + 220; // body drops after title

const NORMAL_SCAN_PREFIXES = [
    'images.pacsbin.com/dicom/production/-yK_x5lnHY_1.2.840.113711.999999.27013.1665069946.2/',  // axial normal CT
    'images.pacsbin.com/dicom/production/-yK_x5lnHY_1.2.840.113711.999999.27013.1665069946.6/',  // coronal normal CT
    'images.pacsbin.com/dicom/production/Zk7qRUbE5O_1.2.840.113619.2.437.3.2299157841.358.1663827198.554/', // head CT
];

const MASK_COLORS = [
    '#22c55e', '#f87171', '#38bdf8', '#fbbf24', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f472b6', '#818cf8', '#34d399',
];

function friendlyStructureLabel(structure) {
    const map = {
        lung_upper_lobe_right: 'R Upper Lobe', lung_middle_lobe_right: 'R Middle Lobe',
        lung_lower_lobe_right: 'R Lower Lobe', lung_upper_lobe_left: 'L Upper Lobe',
        lung_lower_lobe_left: 'L Lower Lobe', kidney_right: 'R Kidney',
        kidney_left: 'L Kidney', kidney_cyst_right: 'R Kidney Cyst',
        kidney_cyst_left: 'L Kidney Cyst', adrenal_gland_right: 'R Adrenal',
        adrenal_gland_left: 'L Adrenal', hip_right: 'R Hip', hip_left: 'L Hip',
        femur_right: 'R Femur', femur_left: 'L Femur',
    };
    if (map[structure]) return map[structure];
    return structure
        .replace(/_/g, ' ')
        .replace(/\bright\b/gi, 'R')
        .replace(/\bleft\b/gi, 'L')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getMaskTransform(orientation) {
    switch (orientation) {
        case 'coronal':
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
        case 'sagittal':
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
        case 'head':
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: false, zOffset: 0 };
        case 'axial':
        default:
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
    }
}

export default function AtlasOverlayMenu() {
    const { data } = useContext(DataContext);
    const { renderingEngine } = data;
    const renderingEngineRef = useRef(renderingEngine);
    renderingEngineRef.current = renderingEngine;

    const [isNormalScan, setIsNormalScan] = useState(false);
    const [orientation, setOrientation] = useState('axial');
    const [availableStructures, setAvailableStructures] = useState([]);
    const [activeMasks, setActiveMasks] = useState({});
    const activeMasksRef = useRef(activeMasks);
    activeMasksRef.current = activeMasks;
    const [loadingStructures, setLoadingStructures] = useState({});

    const [searchQuery, setSearchQuery] = useState('');
    const phaseRef = useRef('button'); // 'button' | 'open'
    const [phase, setPhase] = useState('button');
    /** Icon at final header slot (left); false = centered. Fired in sync with panel WAAPI, not after it. */
    const [headerSlideDone, setHeaderSlideDone] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [fixedAnchor, setFixedAnchor] = useState(null); // { top, right } px

    const panelRef = useRef(null);
    const measuredBtn = useRef({ w: 40, h: 40 });
    const openAnimRef = useRef(null);
    const stagedTimersRef = useRef([]);

    const isOpen = phase === 'open';
    phaseRef.current = phase;

    const clearAll = useCallback(() => {
        const vp = renderingEngine?.getViewport('0-vp');
        const masks = activeMasksRef.current;
        if (vp) {
            Object.values(masks).forEach(m => {
                clearMaskOverlay(vp, m.overlayClass);
            });
            vp.render();
        }
        setActiveMasks({});
    }, [renderingEngine]);

    // ─── 1. Detect if looking at a reference scan ──────────────────────────────
    useEffect(() => {
        if (!renderingEngine) return;

        const checkScan = () => {
            const vp = renderingEngine.getViewport('0-vp');
            if (!vp) return;
            const imageIds = vp.getImageIds?.() || [];
            if (!imageIds.length) return;

            const firstUrl = imageIds[0].replace(/^dicomweb:/, '');
            const isRef = NORMAL_SCAN_PREFIXES.some(prefix => firstUrl.includes(prefix));
            setIsNormalScan(isRef);

            if (isRef) {
                if (firstUrl.includes(NORMAL_SCAN_PREFIXES[1])) setOrientation('coronal');
                else if (firstUrl.includes(NORMAL_SCAN_PREFIXES[2])) setOrientation('head');
                else setOrientation('axial');
            } else {
                clearAll();
            }
        };

        checkScan();
        const interval = setInterval(checkScan, 1000);
        return () => clearInterval(interval);
    }, [renderingEngine, clearAll]);

    // ─── 2. Fetch available structures on open ─────────────────────────────────
    useEffect(() => {
        if (isOpen && isNormalScan && availableStructures.length === 0) {
            fetch(`${BASE_URL}/normal-atlas?orientation=${orientation}`)
                .then(res => res.json())
                .then(d => {
                    if (d.structures) {
                        setAvailableStructures(d.structures.sort());
                    }
                })
                .catch(err => console.error("Failed to fetch structures:", err));
        }
    }, [isOpen, isNormalScan, orientation, availableStructures.length]);

    const handleOpen = () => {
        const el = panelRef.current;
        if (!el) return;
        stagedTimersRef.current.forEach(clearTimeout);
        stagedTimersRef.current = [];
        setHeaderSlideDone(false);
        setShowTitle(false);
        setShowMenu(false);
        measuredBtn.current = {
            w: el.offsetWidth,
            h: el.offsetHeight,
        };
        const r = el.getBoundingClientRect();
        setFixedAnchor({
            top: r.top,
            right: window.innerWidth - r.right,
        });
        setPhase('open');
    };

    useLayoutEffect(() => {
        if (phase !== 'open' || !fixedAnchor || !panelRef.current) return;

        const el = panelRef.current;
        openAnimRef.current?.cancel();

        const { w: bw, h: bh } = measuredBtn.current;
        const ph = Math.min(420, window.innerHeight - fixedAnchor.top - 12);

        el.style.top = `${fixedAnchor.top}px`;
        el.style.right = `${fixedAnchor.right}px`;
        el.style.width = `${bw}px`;
        el.style.height = `${bh}px`;

        requestAnimationFrame(() => {
            const anim = el.animate(
                [
                    { width: `${bw}px`, height: `${bh}px`, borderRadius: '6px' },
                    { width: `${PANEL_W}px`, height: `${ph}px`, borderRadius: '12px' },
                ],
                { duration: OPEN_MS, easing: EASE, fill: 'forwards' }
            );
            openAnimRef.current = anim;
            // Second frame: one paint centered, then slide runs in parallel with panel expand (single motion).
            requestAnimationFrame(() => {
                setHeaderSlideDone(true);
            });
            anim.finished.then(() => {
                openAnimRef.current = null;
                stagedTimersRef.current.push(
                    window.setTimeout(() => setShowTitle(true), TITLE_DELAY_MS - OPEN_MS),
                );
                stagedTimersRef.current.push(
                    window.setTimeout(() => setShowMenu(true), MENU_DELAY_MS - OPEN_MS),
                );
            });
        });

        return () => {
            openAnimRef.current?.cancel();
            stagedTimersRef.current.forEach(clearTimeout);
            stagedTimersRef.current = [];
        };
    }, [phase, fixedAnchor]);

    const handleClose = useCallback(() => {
        const el = panelRef.current;
        if (!el || phaseRef.current !== 'open') return;

        stagedTimersRef.current.forEach(clearTimeout);
        stagedTimersRef.current = [];
        setHeaderSlideDone(false);
        setShowTitle(false);
        setShowMenu(false);
        openAnimRef.current?.cancel();
        const { w: bw, h: bh } = measuredBtn.current;

        setTimeout(() => {
            const anim = el.animate(
                [
                    { width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`, borderRadius: '12px' },
                    { width: `${bw}px`, height: `${bh}px`, borderRadius: '6px' },
                ],
                { duration: CLOSE_MS, easing: EASE, fill: 'forwards' }
            );
            anim.finished.then(() => {
                el.style.removeProperty('width');
                el.style.removeProperty('height');
                el.style.removeProperty('top');
                el.style.removeProperty('right');
                setPhase('button');
                setFixedAnchor(null);
            });
        }, 80);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, handleClose]);

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                handleClose();
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isOpen, handleClose]);

    const toggleStructure = async (structure) => {
        const vp = renderingEngine?.getViewport('0-vp');
        if (!vp) return;

        const currentMask = activeMasks[structure];

        if (currentMask) {
            const newMasks = { ...activeMasks };
            clearMaskOverlay(vp, currentMask.overlayClass);
            delete newMasks[structure];
            setActiveMasks(newMasks);
            vp.render();
            return;
        }

        setLoadingStructures(prev => ({ ...prev, [structure]: true }));
        try {
            const res = await fetch(`${BASE_URL}/normal-atlas/${structure}?orientation=${orientation}`);
            const atlasData = await res.json();

            if (atlasData.error) throw new Error(atlasData.error);

            const maskTransform = getMaskTransform(orientation);
            const activeCount = Object.keys(activeMasks).length;
            const overlayClass = `atlas-mask-${structure}`;
            const colorHex = MASK_COLORS[activeCount % MASK_COLORS.length];

            drawRleMaskOverlay({
                viewport: vp,
                volumeMaskRle: atlasData.mask_rle,
                shape: atlasData.shape,
                overlayClass,
                colorHex,
                ...maskTransform,
            });
            setMaskOverlayVisible(vp, true, overlayClass);

            setActiveMasks(prev => ({
                ...prev,
                [structure]: { visible: true, overlayClass, colorHex }
            }));

            const imageIds = vp.getImageIds();
            const D = atlasData.shape[2];
            const voxelZ = atlasData.centroid_voxel[2];
            const rawZ = maskTransform.flipZ ? (D - 1 - Math.round(voxelZ)) : Math.round(voxelZ);
            const sliceIdx = Math.max(0, Math.min(rawZ - (maskTransform.zOffset || 0), imageIds.length - 1));

            const cam = vp.getCamera();
            vp.setImageIdIndex(sliceIdx);
            vp.setCamera(cam);
            vp.render();

        } catch (err) {
            console.error(`Failed to overlay ${structure}:`, err);
        } finally {
            setLoadingStructures(prev => ({ ...prev, [structure]: false }));
        }
    };

    useEffect(() => () => {
        const vp = renderingEngineRef.current?.getViewport('0-vp');
        const masks = activeMasksRef.current;
        if (vp) {
            Object.values(masks).forEach(m => {
                clearMaskOverlay(vp, m.overlayClass);
            });
            vp.render();
        }
    }, []);

    const filteredStructures = useMemo(() => {
        if (!searchQuery) return availableStructures;
        const lower = searchQuery.toLowerCase();
        return availableStructures.filter(s =>
            s.toLowerCase().includes(lower) ||
            friendlyStructureLabel(s).toLowerCase().includes(lower)
        );
    }, [availableStructures, searchQuery]);

    if (!isNormalScan) return null;

    const activeCount = Object.keys(activeMasks).length;
    const { w: btnW, h: btnH } = measuredBtn.current;

    const shellStyle = {
        background: 'rgba(2, 6, 23, 0.95)',
        border: '1px solid #1e293b',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    };

    return (
        <div
            className="shrink-0 self-center"
            style={isOpen ? { width: btnW, minHeight: btnH } : undefined}
        >
            <div
                ref={panelRef}
                onClick={phase === 'button' ? handleOpen : undefined}
                className={`flex flex-col overflow-hidden backdrop-blur-md ${isOpen ? 'fixed z-[115]' : 'relative z-auto cursor-pointer'} ${phase === 'button' ? 'bg-indigo-600/90 hover:bg-indigo-500' : ''} ${isOpen ? 'min-h-0' : ''}`}
                style={{
                    ...(isOpen && fixedAnchor
                        ? {
                            top: fixedAnchor.top,
                            right: fixedAnchor.right,
                        }
                        : {}),
                    width: phase === 'button' ? btnW : undefined,
                    height: phase === 'button' ? btnH : undefined,
                    minWidth: phase === 'button' ? btnW : undefined,
                    minHeight: phase === 'button' ? btnH : undefined,
                    borderRadius: phase === 'button' ? 6 : 12,
                    ...(phase === 'button' ? {} : shellStyle),
                }}
            >
                {/* Collapsed: icon only */}
                {phase === 'button' && (
                    <div className="flex flex-1 items-center justify-center relative h-10 w-10">
                        <Layers className="h-5 w-5 text-white" />
                        {activeCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-slate-900">
                                {activeCount}
                            </span>
                        )}
                    </div>
                )}

                {/* Open: panel grow + icon glide share OPEN_MS; title/menu after */}
                {phase === 'open' && (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <div
                            className="relative flex shrink-0 w-full border-b border-slate-800/60 bg-slate-900/40 overflow-hidden"
                            style={{ minHeight: btnH, height: btnH }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Icon + title: centered via left 50% + translateX(-50%), then glide to padding-left */}
                            <div
                                className="absolute top-0 bottom-0 flex items-center gap-2"
                                style={{
                                    left: headerSlideDone ? 8 : '50%',
                                    transform: headerSlideDone ? 'translate3d(0,0,0)' : 'translate3d(-50%,0,0)',
                                    transition: `left ${OPEN_MS}ms ${EASE}, transform ${OPEN_MS}ms ${EASE}`,
                                    willChange: 'left, transform',
                                }}
                            >
                                <Layers className="h-5 w-5 text-indigo-400 shrink-0" />
                                {showTitle && (
                                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider whitespace-nowrap animate-in fade-in slide-in-from-left-1 duration-250">
                                        Atlas Overlays
                                    </span>
                                )}
                            </div>
                            <div
                                className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1"
                                style={{
                                    opacity: showTitle ? 1 : 0,
                                    pointerEvents: showTitle ? 'auto' : 'none',
                                    transition: `opacity 220ms ${EASE}`,
                                }}
                            >
                                {activeCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); clearAll(); }}
                                        className="text-[10px] text-slate-400 hover:text-red-400 transition-colors px-1 whitespace-nowrap"
                                    >
                                        Clear All
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleClose(); }}
                                    className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-800 text-slate-400 shrink-0"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {showMenu && (
                        <div
                            className="flex flex-1 flex-col gap-2 p-2 min-h-0 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-350"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500 pointer-events-none" />
                                <Input
                                    placeholder="Find structure..."
                                    className="h-8 pl-8 bg-slate-900/50 border-slate-800 focus-visible:ring-indigo-500 text-sm text-slate-100 placeholder:text-slate-500"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>

                            <ScrollArea className="h-64 pr-3 flex-1 min-h-0">
                                {availableStructures.length === 0 ? (
                                    <div className="flex items-center justify-center h-full py-8 text-xs text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Loading atlas...
                                    </div>
                                ) : filteredStructures.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-500">
                                        No structures found.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {filteredStructures.map(s => {
                                            const isActive = !!activeMasks[s];
                                            const isLoading = !!loadingStructures[s];
                                            const label = friendlyStructureLabel(s);

                                            return (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => toggleStructure(s)}
                                                    disabled={isLoading}
                                                    className={`
                                                        w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left
                                                        ${isActive ? 'bg-indigo-500/20 text-indigo-200' : 'hover:bg-slate-800/80 text-slate-300'}
                                                        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                                                    `}
                                                >
                                                    <div
                                                        className={`w-3 h-3 rounded-[3px] border transition-colors flex items-center justify-center shrink-0 ${isActive
                                                            ? 'border-transparent'
                                                            : 'border-slate-600 bg-slate-900/50'
                                                            }`}
                                                        style={{ backgroundColor: isActive ? activeMasks[s].colorHex : undefined }}
                                                    >
                                                        {isLoading && <Loader2 className="h-2 w-2 animate-spin text-white" />}
                                                    </div>
                                                    <span className="truncate flex-1">{label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

