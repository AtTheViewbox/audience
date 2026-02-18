import { useState, useContext, useEffect } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { DataContext, DataDispatchContext } from '../context/DataContext';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
    setMaskOverlayVisible,
    clearMaskOverlay,
    drawRleMaskOverlay,
    extractInstanceNumber
} from '../lib/medgemma-utils';

export default function MedGemmaImpression({
    BASE_URL,
    onAddToChat,
    onSwitchToChat,
    onClose
}) {
    const { data } = useContext(DataContext);
    const { dispatch } = useContext(DataDispatchContext);
    const { renderingEngine } = data;

    // --- UI STATE ---
    const [maskVisible, setMaskVisible] = useState(true);
    const [pipelineMode, setPipelineMode] = useState("input"); // 'input' | 'select' | 'result'
    const [findings, setFindings] = useState([]);
    const [reportInput, setReportInput] = useState("");
    const [currentFinding, setCurrentFinding] = useState("");
    const [segmentationResult, setSegmentationResult] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [steps, setSteps] = useState([]); // Track all AI actions/outputs
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("Processing...");
    const [maskXform, setMaskXform] = useState({
        xyOrder: 'xMajor',
        flipX: false,
        flipY: true,
        flipZ: true,
        zOffset: -1,
    });

    const toggleMask = () => {
        const viewport = renderingEngine?.getViewport('0-vp');
        if (!viewport) return;

        setMaskVisible(v => {
            const next = !v;
            setMaskOverlayVisible(viewport, next, 'medgemma-overlay');

            // Force redraw immediately
            viewport.element?.__rleRenderOnce?.();

            return next;
        });
    };

    /**
     * Extracts unique slice indices (Z-plane) that contain any masked pixels.
     */
    const getRelevantSliceIndices = (rlePairs, shape, opts) => {
        const [W, H, D] = shape;
        const { flipZ = false, zOffset = 0 } = opts;
        const slices = new Set();

        for (let i = 0; i < rlePairs.length; i += 2) {
            const start = rlePairs[i];
            const len = rlePairs[i + 1];
            const end = start + len;

            for (let p = start; p < end; p++) {
                // p is flattened index in W*H*D
                const zInVolume = p % D;

                // Map volume Z back to image stack index
                // This logic must match sliceBinary_ZYX and navigation logic
                const rawZ = flipZ ? (D - 1 - zInVolume) : zInVolume;
                const sliceIdx = rawZ - (zOffset || 0);

                if (sliceIdx >= 0) {
                    slices.add(sliceIdx);
                }
            }
        }

        return Array.from(slices).sort((a, b) => a - b);
    };

    const clearMask = () => {
        const viewport = renderingEngine?.getViewport('0-vp');
        if (!viewport) return;
        clearMaskOverlay(viewport, 'medgemma-overlay');
        setSegmentationResult(null);
    };

    useEffect(() => {
        const viewport = renderingEngine?.getViewport('0-vp');
        if (!viewport) return;

        const el = viewport.element;
        if (!el?.__rleSeriesData) return;

        // Update opts live
        el.__rleSeriesData.opts = { ...maskXform };

        // Clear cache so new orientation rebuilds per-slice masks correctly
        el.__rleSeriesData.cache2D = {};

        // Force redraw
        if (el.__rleRenderOnce) el.__rleRenderOnce();
    }, [maskXform, renderingEngine]);

    useEffect(() => {
        return () => {
            // Do NOT clear overlay here, otherwise it disappears when this popup unmounts.
            // Only clear it when you explicitly want to remove the segmentation.
        };
    }, []);

    // --- PARSING LOGIC ---
    const parseFindings = (text) => {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        const extracted = lines
            .map(line => line.trim())
            .filter(line => line.length > 5)
            .map(line => line.replace(/^[\-\*•\d\.]+\s*/, ''));
        return extracted;
    };

    const handleParse = () => {
        const extracted = parseFindings(reportInput);
        if (extracted.length === 0) {
            toast.error("No findings could be parsed. Please try pasting a list.");
            return;
        }
        setFindings(extracted);
        setPipelineMode("select");
    };

    const handleSelectFinding = (finding) => {
        setCurrentFinding(finding);
        setPipelineMode("result");
        setSegmentationResult(null);
        setSteps([]); // Clear previous steps
        handleSegmentation(finding);
    };

    // --- HELPER: Apply Windowing ---
    const applyWindowing = async (viewport, wwHU, wcHU, name) => {
        try {
            const imageId = viewport.getCurrentImageId();
            let slope = 1, intercept = 0;

            const image = cornerstone.cache.getImage(imageId);
            if (image) {
                slope = image.slope ?? (image.intercept?.slope ?? 1);
                intercept = image.intercept ?? (image.intercept?.intercept ?? 0);
            } else {
                const modalityLut = cornerstone.metaData.get('modalityLutModule', imageId) || {};
                slope = modalityLut.rescaleSlope ?? 1;
                intercept = modalityLut.rescaleIntercept ?? 0;
            }

            // Convert HU to Stored Values
            const wwSV = wwHU / slope;
            const wcSV = (wcHU - intercept) / slope;

            viewport.setProperties({
                voiRange: cornerstone.utilities.windowLevel.toLowHighRange(wwSV, wcSV)
            });
            viewport.render();

        } catch (err) {
            console.error("Failed to apply windowing:", err);
        }
    };



    // --- SUMMARY GENERATION ---
    const generatePatientSummary = async (structure) => {
        if (!renderingEngine) return null;

        setSummaryLoading(true);
        setLoadingText("Capturing slices for analysis...");

        try {
            const viewport = renderingEngine.getViewport('0-vp');

            // Capture 11 slices: current - 5 to current + 5
            const currentIdx = viewport.getCurrentImageIdIndex();
            const imageIds = viewport.getImageIds();
            const total = imageIds.length;

            const indices = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
                .map(d => currentIdx + d)
                .filter(i => i >= 0 && i < total);

            toast.info(`Analyzing ${indices.length} slices for comprehensive summary...`);

            setLoadingText("Generating AI analysis...");

            // Call summary endpoint
            // Get DICOM URLs for High-Res Backend Processing
            const dicomUrls = indices.map(idx => imageIds[idx].replace(/^dicomweb:/, ''));

            const response = await fetch(`${BASE_URL}/summary-multi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Analyze the ${structure} finding: ${currentFinding}`,
                    dicom_urls: dicomUrls
                })
            });

            if (!response.ok) {
                throw new Error(`Summary generation failed: ${response.statusText}`);
            }

            const data = await response.json();
            const summary = data.summary || "No summary generated.";

            setSteps(prev => [...prev, {
                type: 'summary',
                content: summary,
                timestamp: new Date().toISOString()
            }]);

            // Add to chat using props callback
            if (onAddToChat) {
                onAddToChat(`**Multi-Slice Analysis Complete** for "${currentFinding}":\n\n${summary}`);
            }

            // Switch to chat tab
            if (onSwitchToChat) {
                onSwitchToChat();
            }
            toast.success("Analysis complete! Switched to Chat.");

            return summary;

        } catch (error) {
            console.error("Summary generation error:", error);
            setSteps(prev => [...prev, {
                type: 'error',
                content: `**Summary Generation Failed**: ${error.message}`,
                timestamp: new Date().toISOString()
            }]);
            toast.error(`Summary failed: ${error.message}`);
            return null;
        } finally {
            setSummaryLoading(false);
            setLoadingText("Processing...");
        }
    };

    const handleWindowingRecommendation = async (structure, viewport) => {
        if (!structure || !viewport) return;

        try {
            const winResp = await fetch(`${BASE_URL}/check-window`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: `Show me the ${structure}` })
            });

            if (winResp.ok) {
                const winData = await winResp.json();
                if (winData.action && winData.action.type === 'set_window_level') {
                    const { window: ww, level: wl, name } = winData.action;
                    await applyWindowing(viewport, ww, wl, name);

                    setSteps(prev => [...prev, {
                        type: 'agent',
                        content: `**Windowing Applied**: **${name || "AI Suggestion"}** (W:${ww}/L:${wl})`,
                        action: winData.action,
                        timestamp: new Date().toISOString()
                    }]);
                }
            }
        } catch (err) {
            console.warn("Parallel windowing suggestion failed", err);
        }
    };

    // --- PIPELINE LOGIC ---
    const handleSegmentation = async (findingText) => {
        setLoading(true);
        setLoadingText("Initializing analysis pipeline...");

        try {
            if (!renderingEngine) throw new Error('No image loaded');
            const viewport = renderingEngine.getViewport('0-vp');
            if (!viewport) throw new Error('Viewport not found');

            // --- STEP 0: Capture Image & Gather Context ---
            const canvas = viewport.getCanvas();
            if (!canvas) throw new Error('Canvas not found');

            const base64 = await new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                }, 'image/png');
            });

            // Get DICOM URLs for High-Res Backend Processing
            const imageIds = viewport.getImageIds();
            const dicomUrls = imageIds.map(id => id.replace(/^dicomweb:/, ''));

            // --- STEP 1: Detect Modality ---
            setLoadingText("Detecting imaging modality...");
            // Pass BOTH base64 (visual fallback) and dicomUrls (header precision)
            const modResp = await fetch(`${BASE_URL}/detect-modality`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: base64,
                    dicom_urls: dicomUrls
                })
            });

            if (!modResp.ok) throw new Error("Failed to detect modality");
            const modData = await modResp.json();
            const modality = modData.modality || "Unknown";
            const confidence = modData.confidence || 0;

            setSteps(prev => [...prev, {
                type: 'agent',
                content: `**Modality Detected**: ${modality} (${(confidence * 100).toFixed(0)}% confidence)\n\n**Reasoning**: ${modData.reasoning || "Visual analysis"}`,
                action: { type: 'detect_modality', modality, confidence },
                timestamp: new Date().toISOString()
            }]);

            // --- STEP 2: Windowing (Gated) ---
            // Only for CT or X-Ray
            if (['CT', 'X-Ray'].includes(modality)) {
                setLoadingText(`Optimizing ${modality} windowing...`);
                // Run in background but don't await blocking the rest
                handleWindowingRecommendation(findingText || "Optimize visibility", viewport);
            } else {
                setSteps(prev => [...prev, {
                    type: 'info',
                    content: `Skipping windowing optimization (not applicable for ${modality})`,
                    timestamp: new Date().toISOString()
                }]);
            }

            // --- STEP 3: Segmentation (Gated) ---
            // Only for CT or MRI
            if (['CT', 'MRI', 'MR'].includes(modality)) {

                // Identify Structure
                setLoadingText("Identifying structure...");
                const identifyResp = await fetch(`${BASE_URL}/identify_structure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: findingText })
                });

                if (!identifyResp.ok) throw new Error("Structure identification failed");
                const identifyData = await identifyResp.json();
                const structure = identifyData.structure;

                if (!structure) {
                    toast.warning("No structure identified for segmentation.");
                    setSteps(prev => [...prev, {
                        type: 'warning',
                        content: "No specific anatomical structure identified in text to segment.",
                        timestamp: new Date().toISOString()
                    }]);
                } else {
                    setSteps(prev => [...prev, {
                        type: 'agent',
                        content: `**Structure Identified**: ${structure}`,
                        action: { type: 'identify_structure', structure },
                        timestamp: new Date().toISOString()
                    }]);

                    // Perform Segmentation
                    const imageIds = viewport.getImageIds();
                    const dicomUrls = imageIds.map(id => id.replace(/^dicomweb:/, ''));

                    setLoadingText(`Segmenting ${structure} on ${modality}...`);

                    const segmentResp = await fetch(`${BASE_URL}/segment_dicom`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            dicom_urls: dicomUrls,
                            structure: structure,
                            modality: modality // Explicitly pass detected modality
                        })
                    });

                    if (!segmentResp.ok) throw new Error("Segmentation request failed");
                    const segmentData = await segmentResp.json();

                    if (segmentData.error) throw new Error(segmentData.error);

                    if (!segmentData.found) {
                        toast.warning(`Could not segment ${structure}`);
                        setSteps(prev => [...prev, {
                            type: 'warning',
                            content: `**Segmentation Failed**: Structure '${structure}' not found or not visible.`,
                            timestamp: new Date().toISOString()
                        }]);
                    } else {
                        // Success - Process Result
                        const { mask_rle, shape, centroid_voxel } = segmentData;

                        setSteps(prev => [...prev, {
                            type: 'agent',
                            content: `**Segmentation Complete**: ${structure} (${modality})`,
                            action: { type: 'segment_structure', structure, shape },
                            timestamp: new Date().toISOString()
                        }]);

                        // DRAW OVERLAY IMMEDIATELY (so user sees it while AI analyzes)
                        drawRleMaskOverlay({
                            viewport,
                            volumeMaskRle: mask_rle,
                            shape: shape,
                            overlayClass: 'medgemma-overlay',
                            ...maskXform
                        });
                        setMaskOverlayVisible(viewport, true, 'medgemma-overlay');
                        setMaskVisible(true);

                        // INITIAL NAVIGATION (Centroid)
                        const voxelZ = centroid_voxel[2];
                        const D = shape[2];
                        const rawZFromCentroid = maskXform.flipZ ? (D - 1 - Math.round(voxelZ)) : Math.round(voxelZ);
                        const initialSliceIndex = rawZFromCentroid - (maskXform.zOffset || 0);
                        const initialSafeIndex = Math.max(0, Math.min(initialSliceIndex, imageIds.length - 1));

                        const targetImageId = imageIds[initialSafeIndex];
                        const localStack = viewport.getImageIds();
                        const localIndex = localStack.indexOf(targetImageId);
                        if (localIndex !== -1) {
                            const currentCamera = viewport.getCamera();
                            viewport.setImageIdIndex(localIndex);
                            viewport.setCamera(currentCamera);
                            viewport.render();
                        }

                        // --- NEW: Multi-Slice Analysis Path ---
                        try {
                            setLoadingText("Selecting slices for analysis...");

                            const maskSlices = getRelevantSliceIndices(mask_rle, shape, maskXform);

                            // Pick up to 15 evenly-spaced slices from mask (or centroid fallback)
                            const pickSlices = (slices, n = 15) => {
                                if (slices.length === 0) {
                                    // Fallback: centroid ± slices
                                    return Array.from({ length: n }, (_, i) =>
                                        Math.max(0, Math.min(initialSafeIndex - Math.floor(n / 2) + i, imageIds.length - 1))
                                    );
                                }
                                if (slices.length <= n) return slices;
                                const step = (slices.length - 1) / (n - 1);
                                return Array.from({ length: n }, (_, i) => slices[Math.round(i * step)]);
                            };

                            const selectedSlices = pickSlices(maskSlices);
                            const dicomUrls = selectedSlices.map(idx =>
                                imageIds[Math.max(0, Math.min(idx, imageIds.length - 1))].replace(/^dicomweb:/, '')
                            );

                            setLoadingText(`Generating summary from ${selectedSlices.length} slices...`);
                            toast.info(`Analyzing ${selectedSlices.length} slices...`);

                            const resp = await fetch(`${BASE_URL}/summary-multi`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    dicom_urls: dicomUrls,
                                    text: `Analyze this ${structure} finding: "${findingText}"`
                                })
                            });

                            if (!resp.ok) throw new Error(`Summary failed: ${resp.statusText}`);
                            const summaryData = await resp.json();
                            const summary = summaryData.summary || "No summary generated.";

                            setSteps(prev => [...prev, {
                                type: 'summary',
                                content: summary,
                                timestamp: new Date().toISOString()
                            }]);

                            if (onAddToChat) onAddToChat(`${summary}`);
                            if (onSwitchToChat) onSwitchToChat();
                            // Close popover
                            //onClose?.();

                        } catch (summaryErr) {
                            console.warn("Multi-slice analysis failed:", summaryErr);
                            setSteps(prev => [...prev, {
                                type: 'error',
                                content: `**Analysis Error**: ${summaryErr.message}`,
                                timestamp: new Date().toISOString()
                            }]);
                        }


                    }
                }

            } else {
                toast.info(`Segmentation not available for ${modality}`);
                setSteps(prev => [...prev, {
                    type: 'info',
                    content: `Skipping segmentation (only available for CT/MRI, detected: ${modality})`,
                    timestamp: new Date().toISOString()
                }]);
            }

        } catch (error) {
            console.error("Pipeline error:", error);
            setSteps(prev => [...prev, {
                type: 'error',
                content: `**Error**: ${error.message}`,
                timestamp: new Date().toISOString()
            }]);
            toast.error(`Analysis failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full text-slate-200">
            {/* INPUT MODE */}
            {pipelineMode === 'input' && (
                <div className="flex-1 flex flex-col p-4 gap-4">
                    <div className="space-y-1">
                        <Label className="text-sm font-medium text-slate-200">Radiology Report / Impressions</Label>
                        <p className="text-[11px] text-slate-400">Paste findings below. MedGemma will parse them for individual analysis.</p>
                    </div>
                    <Textarea
                        value={reportInput}
                        onChange={(e) => setReportInput(e.target.value)}
                        placeholder="1. 5mm nodule in RUL&#10;2. Trace pleural effusion..."
                        className="flex-1 resize-none font-mono text-xs leading-relaxed p-3 focus-visible:ring-1 bg-slate-900/50 text-slate-100 border-slate-800 placeholder:text-slate-500"
                    />
                    <Button onClick={handleParse} disabled={!reportInput.trim()} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20">
                        <Sparkles className="mr-2 h-4 w-4" /> Identify Findings
                    </Button>
                </div>
            )}

            {/* SELECT MODE */}
            {pipelineMode === 'select' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/20">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Finding</span>
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => setPipelineMode('input')}>Back</Button>
                    </div>
                    <ScrollArea className="flex-1 px-4 py-2">
                        <div className="space-y-2 py-2">
                            {findings.map((f, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleSelectFinding(f)}
                                    className="group p-3 bg-slate-900/40 border border-slate-800 shadow-sm rounded-lg hover:border-blue-500/50 hover:bg-slate-900/60 cursor-pointer transition-all"
                                >
                                    <div className="flex gap-3 items-start">
                                        <div className="mt-0.5 h-5 w-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                            {i + 1}
                                        </div>
                                        <span className="text-sm leading-snug text-slate-200 group-hover:text-blue-400 transition-colors">{f}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            {/* RESULT MODE */}
            {pipelineMode === 'result' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/20">
                    <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center shadow-sm bg-slate-900/40">
                        <div className="flex flex-col overflow-hidden mr-3">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Analyzing Finding</span>
                            <span className="text-xs font-semibold truncate text-slate-100" title={currentFinding}>{currentFinding}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-slate-700" onClick={() => setPipelineMode('select')}>
                            <ArrowLeft className="mr-1 h-3 w-3" /> Back
                        </Button>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">

                            {/* Mask Controls */}
                            {(() => {
                                const viewport = renderingEngine?.getViewport('0-vp');
                                const hasMask = !!viewport?.element?.__rleSeriesData;
                                return (
                                    <div className="space-y-2 pb-3 border-b border-slate-800">
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="ghost"
                                                onClick={toggleMask}
                                                className={`w-full h-8 text-xs font-semibold border ${maskVisible ? 'border-blue-500/50 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                                                disabled={!hasMask}
                                            >
                                                {maskVisible ? "Hide Mask" : "Show Mask"}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={clearMask}
                                                className="w-full h-8 text-xs font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/30"
                                                disabled={!hasMask}
                                            >
                                                <Trash2 className="mr-1 h-3 w-3" /> Clear
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* AI Action Logs */}
                            {steps.length > 0 && (
                                <div className="space-y-3">
                                    {steps.map((step, i) => {
                                        const isLast = i === steps.length - 1;
                                        let label = "AI Output";
                                        let colorClass = "text-purple-400";
                                        let bgClass = "bg-purple-950/30";
                                        let borderClass = "border-purple-800/50";

                                        if (step.type === 'summary') {
                                            label = "Patient Summary";
                                            colorClass = "text-emerald-400";
                                            bgClass = "bg-emerald-950/30";
                                            borderClass = "border-emerald-800/50";
                                        } else if (step.type === 'error') {
                                            label = "Error";
                                            colorClass = "text-red-400";
                                            bgClass = "bg-red-950/30";
                                            borderClass = "border-red-800/50";
                                        } else if (step.type === 'warning') {
                                            label = "Warning";
                                            colorClass = "text-amber-400";
                                            bgClass = "bg-amber-950/30";
                                            borderClass = "border-amber-800/50";
                                        } else if (step.type === 'info') {
                                            label = "Info";
                                            colorClass = "text-slate-400";
                                            bgClass = "bg-slate-900/40";
                                            borderClass = "border-slate-700/50";
                                        } else if (step.action) {
                                            label = `Action: ${step.action.type.replace(/_/g, ' ')}`;
                                            colorClass = "text-blue-400";
                                            bgClass = "bg-blue-950/30";
                                            borderClass = "border-blue-800/50";
                                        }

                                        return (
                                            <div key={i} className={`border rounded-lg overflow-hidden ${borderClass} ${isLast ? 'shadow-md ring-1 ring-blue-500/20' : 'opacity-70'}`}>
                                                <details open={isLast || step.type === 'summary' || step.type === 'error'} className="group">
                                                    <summary className={`cursor-pointer px-3 py-2 ${bgClass} font-medium text-[10px] flex items-center justify-between gap-2 select-none group-open:border-b ${borderClass} text-slate-300 list-none [&::-webkit-details-marker]:hidden`}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-600 font-mono text-[9px]">#{i + 1}</span>
                                                            <span className={`font-bold uppercase tracking-tight ${colorClass}`}>{label}</span>
                                                        </div>
                                                        <div className={`text-[10px] ${colorClass} opacity-60 group-open:rotate-180 transition-transform`}>▼</div>
                                                    </summary>
                                                    <div className="p-3 text-xs leading-relaxed bg-slate-900/60">
                                                        <div className="markdown-content text-slate-300 prose prose-invert prose-xs max-w-none">
                                                            <ReactMarkdown>{step.content}</ReactMarkdown>
                                                        </div>
                                                        {step.action && (
                                                            <div className="mt-2 pt-2 border-t border-slate-700 font-mono text-[9px] text-slate-500 bg-slate-950/50 p-2 rounded-md">
                                                                {JSON.stringify(step.action, null, 2)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Loading */}
                            {loading && (
                                <div className="flex items-center justify-center py-8 bg-slate-900/40 rounded-xl border-2 border-dashed border-blue-500/20">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                                        <span className="text-sm font-medium text-blue-400">{loadingText}</span>
                                    </div>
                                </div>
                            )}

                            {/* Segmentation Result Card */}
                            {segmentationResult && (
                                <div className={`border rounded-lg overflow-hidden ${segmentationResult.success ? 'border-emerald-800/50' : 'border-red-800/50'}`}>
                                    <div className={`px-4 py-3 font-semibold text-sm ${segmentationResult.success ? 'bg-emerald-950/30 text-emerald-400' : 'bg-red-950/30 text-red-400'}`}>
                                        {segmentationResult.success ? '✓ Segmentation Complete' : '✗ Segmentation Failed'}
                                    </div>
                                    <div className="p-4 space-y-3 bg-slate-900/60">
                                        {segmentationResult.structure && (
                                            <div>
                                                <span className="text-xs font-semibold text-slate-500">Structure Identified:</span>
                                                <p className="text-sm font-medium mt-1 text-slate-200">{segmentationResult.structure}</p>
                                            </div>
                                        )}
                                        {segmentationResult.thought && (
                                            <div>
                                                <span className="text-xs font-semibold text-slate-500">AI Reasoning:</span>
                                                <p className="text-xs mt-1 text-slate-400 italic">{segmentationResult.thought}</p>
                                            </div>
                                        )}
                                        {segmentationResult.window && (
                                            <div>
                                                <span className="text-xs font-semibold text-slate-500">Windowing Applied:</span>
                                                <p className="text-sm font-medium mt-1 text-slate-200">{segmentationResult.window}</p>
                                                {segmentationResult.window_thought && (
                                                    <p className="text-xs mt-1 text-slate-400 italic">{segmentationResult.window_thought}</p>
                                                )}
                                            </div>
                                        )}
                                        {segmentationResult.slice !== undefined && (
                                            <div>
                                                <span className="text-xs font-semibold text-slate-500">Navigated to Slice:</span>
                                                <p className="text-sm font-medium mt-1 text-slate-200">#{segmentationResult.slice}</p>
                                            </div>
                                        )}
                                        {segmentationResult.message && (
                                            <p className="text-sm text-slate-400">{segmentationResult.message}</p>
                                        )}
                                        {segmentationResult.success && (
                                            <div className="pt-3 border-t border-slate-700 space-y-2">
                                                <Button
                                                    onClick={() => generatePatientSummary(segmentationResult.structure)}
                                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20"
                                                    disabled={summaryLoading}
                                                >
                                                    {summaryLoading ? (
                                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating Summary...</>
                                                    ) : (
                                                        <><Sparkles className="mr-2 h-4 w-4" />Generate Multi-Slice Summary</>
                                                    )}
                                                </Button>
                                                <Button
                                                    onClick={() => onSwitchToChat?.()}
                                                    className="w-full bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                                                >
                                                    Continue in Chat
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}
{/* Precision Orientation Controls - Commented out for production but kept for debugging */ }
{/* 
                                        <div className="pt-2 border-t">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Precision Orientation Controls</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`h-7 text-[10px] ${maskXform.flipX ? 'bg-primary/10 border-primary text-primary' : ''}`}
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, flipX: !s.flipX }))}
                                                >
                                                    {maskXform.flipX ? "✓ Flip X" : "Flip X"}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`h-7 text-[10px] ${maskXform.flipY ? 'bg-primary/10 border-primary text-primary' : ''}`}
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, flipY: !s.flipY }))}
                                                >
                                                    {maskXform.flipY ? "✓ Flip Y" : "Flip Y"}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`h-7 text-[10px] ${maskXform.flipZ ? 'bg-primary/10 border-primary text-primary' : ''}`}
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, flipZ: !s.flipZ }))}
                                                >
                                                    {maskXform.flipZ ? "✓ Flip Z (Order)" : "Flip Z (Order)"}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`h-7 text-[10px] ${maskXform.xyOrder === 'xMajor' ? 'bg-primary/10 border-primary text-primary' : ''}`}
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, xyOrder: s.xyOrder === 'yMajor' ? 'xMajor' : 'yMajor' }))}
                                                >
                                                    {maskXform.xyOrder === 'xMajor' ? "✓ Swap XY (xMajor)" : "Swap XY (yMajor)"}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[10px] col-span-2"
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, zOffset: (s.zOffset || 0) + 1 }))}
                                                >
                                                     Z Nudge +1 (Index: {maskXform.zOffset || 0})
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[10px] col-span-2"
                                                    disabled={!hasMask}
                                                    onClick={() => setMaskXform(s => ({ ...s, zOffset: (s.zOffset || 0) - 1 }))}
                                                >
                                                     Z Nudge -1 (Index: {maskXform.zOffset || 0})
                                                </Button>
                                            </div>
                                        </div>
                                         */}