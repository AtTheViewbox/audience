import { useState, useEffect, useContext, useMemo } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { DataContext } from '../../context/DataContext';
import { UserContext } from '../../context/UserContext';
import { Button } from '@/components/ui/button';
import { Layers, Search, X, Loader2 } from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    drawRleMaskOverlay,
    setMaskOverlayVisible,
    clearMaskOverlay,
} from '../../lib/medgemma-utils';

const BASE_URL = import.meta.env.VITE_MEDGEMMA_API_URL || 'https://mfei1225--medgemma-dual-agent-v11-api.modal.run';

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
            // Head CT needs flipZ false to align correctly since its slices go inferior to superior
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: false, zOffset: 0 };
        case 'axial':
        default:
            return { xyOrder: 'xMajor', flipX: false, flipY: true, flipZ: true, zOffset: -1 };
    }
}

export default function AtlasOverlayMenu() {
    const { userData, supabaseClient } = useContext(UserContext).data || {};
    const { data } = useContext(DataContext);
    const { renderingEngine } = data;

    const [isNormalScan, setIsNormalScan] = useState(false);
    const [orientation, setOrientation] = useState('axial');
    const [availableStructures, setAvailableStructures] = useState([]);
    const [activeMasks, setActiveMasks] = useState({}); // { structure: { visible, overlayClass, colorHex } }
    const [loadingStructures, setLoadingStructures] = useState({}); // { structure: boolean }

    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);

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
                // Determine orientation based on the prefix used
                if (firstUrl.includes(NORMAL_SCAN_PREFIXES[1])) setOrientation('coronal');
                else if (firstUrl.includes(NORMAL_SCAN_PREFIXES[2])) setOrientation('head');
                else setOrientation('axial');
            } else {
                // If it was normal and now it isn't, clean up
                clearAll();
            }
        };

        // Check initially and poll a few times just in case it's still loading
        checkScan();
        const interval = setInterval(checkScan, 1000);
        return () => clearInterval(interval);
    }, [renderingEngine]);

    // ─── 2. Fetch available structures on open ─────────────────────────────────
    useEffect(() => {
        if (isOpen && isNormalScan && availableStructures.length === 0) {
            fetch(`${BASE_URL}/normal-atlas?orientation=${orientation}`)
                .then(res => res.json())
                .then(data => {
                    if (data.structures) {
                        setAvailableStructures(data.structures.sort());
                    }
                })
                .catch(err => console.error("Failed to fetch structures:", err));
        }
    }, [isOpen, isNormalScan, orientation]);

    // ─── 3. Toggle a specific mask ─────────────────────────────────────────────
    const toggleStructure = async (structure) => {
        const vp = renderingEngine?.getViewport('0-vp');
        if (!vp) return;

        const currentMask = activeMasks[structure];

        // If it's already active, just hide/remove it
        if (currentMask) {
            const newMasks = { ...activeMasks };
            clearMaskOverlay(vp, currentMask.overlayClass);
            delete newMasks[structure];
            setActiveMasks(newMasks);
            vp.render();
            return;
        }

        // Otherwise, fetch and draw it
        setLoadingStructures(prev => ({ ...prev, [structure]: true }));
        try {
            const res = await fetch(`${BASE_URL}/normal-atlas/${structure}?orientation=${orientation}`);
            const atlasData = await res.json();

            if (atlasData.error) throw new Error(atlasData.error);

            const maskTransform = getMaskTransform(orientation);

            // Generate a unique class and pick a color based on active count
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

            // Save to active state
            setActiveMasks(prev => ({
                ...prev,
                [structure]: { visible: true, overlayClass, colorHex }
            }));

            // Navigate to its centroid so users see it immediately
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

    const clearAll = () => {
        const vp = renderingEngine?.getViewport('0-vp');
        if (vp) {
            Object.values(activeMasks).forEach(m => {
                clearMaskOverlay(vp, m.overlayClass);
            });
            vp.render();
        }
        setActiveMasks({});
    };

    const clearAllCacheOnUnmount = () => {
        clearAll();
    };

    // Cleanup on unmount
    useEffect(() => clearAllCacheOnUnmount, []);

    // ─── Filtered list ─────────────────────────────────────────────────────────
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

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    size="icon"
                    className={`fixed top-[12px] bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-lg z-50 rounded-md ${
                        import.meta.env.BUILD_ENV === 'main' || import.meta.env.BUILD_ENV === 'staging' 
                            ? 'right-[12px]' 
                            : 'right-[172px]'
                    }`}
                    title="Atlas Mask Overlays"
                >
                    <Layers className="h-5 w-5" />
                    {activeCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-slate-900 border-none">
                            {activeCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-64 p-2 bg-slate-950/95 border-slate-800 shadow-xl backdrop-blur-md rounded-xl" align="start" sideOffset={8}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-slate-800/60">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Atlas Overlays</span>
                        {activeCount > 0 && (
                            <button
                                onClick={clearAll}
                                className="text-[10px] text-slate-400 hover:text-red-400 transition-colors"
                            >
                                Clear All
                            </button>
                        )}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Find structure..."
                            className="h-8 pl-8 bg-slate-900/50 border-slate-800 focus-visible:ring-indigo-500 text-sm text-slate-100 placeholder:text-slate-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    <ScrollArea className="h-64 mt-1 pr-3">
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
            </PopoverContent>
        </Popover>
    );
}
