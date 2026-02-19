import { useState, useEffect, useRef, useContext } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { Button } from '@/components/ui/button';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Bot, Loader2, Send, User, Share,
    ChevronDown, Zap, Eye, Layers, Link, MessageSquare, Search
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
    drawRleMaskOverlay,
    setMaskOverlayVisible,
    clearMaskOverlay,
} from '../../lib/medgemma-utils';

const Visibility = { PUBLIC: 'PUBLIC' };
const Mode = { TEAM: 'TEAM' };

// Default mask transform for RLE overlay rendering
const DEFAULT_MASK_XFORM = {
    xyOrder: 'xMajor',
    flipX: false,
    flipY: true,
    flipZ: true,
    zOffset: -1,
};

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
        case 'axial':
        default:
            return { ...DEFAULT_MASK_XFORM };
    }
}

// ── Tool step icons & labels ──────────────────────────────────────────────────
const STEP_META = {
    routing: { icon: Zap, label: 'Routing intent', color: 'text-slate-400', bg: 'bg-slate-900/60', border: 'border-slate-700/50' },
    windowing: { icon: Layers, label: 'Adjusting window', color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-800/50' },
    modality: { icon: Search, label: 'Detecting modality', color: 'text-purple-400', bg: 'bg-purple-950/30', border: 'border-purple-800/50' },
    segmentation: { icon: Eye, label: 'Segmenting structure', color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-800/50' },
    summary: { icon: MessageSquare, label: 'Analyzing images', color: 'text-cyan-400', bg: 'bg-cyan-950/30', border: 'border-cyan-800/50' },
    share: { icon: Link, label: 'Generating share link', color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-800/50' },
    error: { icon: Zap, label: 'Error', color: 'text-red-400', bg: 'bg-red-950/30', border: 'border-red-800/50' },
};

// ── Collapsible step bubble ───────────────────────────────────────────────────
function StepBubble({ step }) {
    const [open, setOpen] = useState(step.status === 'running');

    // Auto-collapse when step finishes
    useEffect(() => {
        if (step.status !== 'running') {
            const t = setTimeout(() => setOpen(false), 800);
            return () => clearTimeout(t);
        }
    }, [step.status]);

    const meta = STEP_META[step.type] || STEP_META.routing;
    const Icon = meta.icon;

    return (
        <div className={`rounded-lg border overflow-hidden text-[11px] ${meta.border}`}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 ${meta.bg} hover:brightness-110 transition-all`}
            >
                {step.status === 'running'
                    ? <Loader2 className={`h-3 w-3 animate-spin flex-shrink-0 ${meta.color}`} />
                    : <Icon className={`h-3 w-3 flex-shrink-0 ${meta.color}`} />
                }
                <span className={`font-semibold flex-1 text-left ${meta.color}`}>
                    {step.label || meta.label}
                    {step.status === 'running' && '…'}
                </span>
                {step.status !== 'running' && (
                    <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                )}
            </button>
            {open && step.result && (
                <div className="px-3 py-2 text-slate-400 bg-slate-900/40 leading-relaxed whitespace-pre-wrap">
                    {step.result}
                </div>
            )}
        </div>
    );
}

// ── Thinking dots (shown during silent routing) ───────────────────────────────
function ThinkingDots() {
    return (
        <div className="flex items-center gap-1 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-2xl rounded-tl-sm w-fit">
            <style>{`
                @keyframes mgDot { 0%,80%,100%{transform:translateY(0);opacity:.3} 40%{transform:translateY(-4px);opacity:1} }
            `}</style>
            {[0, 150, 300].map(delay => (
                <span
                    key={delay}
                    className="block h-1.5 w-1.5 rounded-full bg-blue-400"
                    style={{ animation: `mgDot 1.2s ease-in-out ${delay}ms infinite` }}
                />
            ))}
        </div>
    );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
    const isUser = msg.role === 'user';
    const isPending = !!msg._pending;
    const hasSteps = (msg.steps?.length ?? 0) > 0;

    return (
        <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${isUser
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                }`}>
                {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            </div>
            <div className="flex flex-col gap-1.5 max-w-[88%]">
                {/* Thinking dots — only while pending with no steps yet */}
                {!isUser && isPending && !hasSteps && <ThinkingDots />}

                {/* Tool steps (only on assistant messages) */}
                {!isUser && hasSteps && (
                    <div className="flex flex-col gap-1">
                        {msg.steps.map((step, i) => (
                            <StepBubble key={i} step={step} />
                        ))}
                    </div>
                )}
                {/* Content bubble */}
                {msg.content && (
                    <div className={`p-2 text-xs leading-relaxed ${isUser
                        ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-slate-900/60 border border-slate-800 text-slate-200 rounded-2xl rounded-tl-sm'
                        }`}>
                        {isUser ? msg.content : (
                            <div className="markdown-content [&_p]:text-slate-200 [&_li]:text-slate-200 [&_h1]:text-slate-100 [&_h2]:text-slate-100 [&_h3]:text-slate-100 [&_strong]:text-slate-100 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main AgentChat component ──────────────────────────────────────────────────
export default function AgentChat({
    messages,
    setMessages,
    BASE_URL,
    renderingEngine,
    userData,
    supabaseClient,
    dispatch,      // DataDispatchContext dispatch — used to join sessions reactively
    onMaskReady,   // (hasMask: bool) => void
}) {
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [activeMasks, setActiveMasks] = useState([]);
    const scrollRef = useRef(null);
    const textareaRef = useRef(null);
    const studyCacheRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`; // cap at ~5 rows
    }, [chatInput]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, chatLoading]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const getViewport = () => renderingEngine?.getViewport('0-vp') ?? null;

    const getDicomUrls = (viewport) => {
        if (!viewport) return [];
        return (viewport.getImageIds?.() ?? []).map(id => id.replace(/^dicomweb:/, ''));
    };

    const applyWindowing = async (viewport, wwHU, wcHU) => {
        try {
            const imageId = viewport.getCurrentImageId();
            let slope = 1, intercept = 0;
            const image = cornerstone.cache.getImage(imageId);
            if (image) {
                slope = image.slope ?? 1;
                intercept = image.intercept ?? 0;
            } else {
                const lut = cornerstone.metaData.get('modalityLutModule', imageId) || {};
                slope = lut.rescaleSlope ?? 1;
                intercept = lut.rescaleIntercept ?? 0;
            }
            const wwSV = wwHU / slope;
            const wcSV = (wcHU - intercept) / slope;
            viewport.setProperties({ voiRange: cornerstone.utilities.windowLevel.toLowHighRange(wwSV, wcSV) });
            viewport.render();
        } catch (err) {
            console.error('Windowing failed:', err);
        }
    };

    const clearAllMasks = () => {
        const vp = getViewport();
        if (vp) {
            clearMaskOverlay(vp, 'medgemma-overlay');
            activeMasks.forEach(m => clearMaskOverlay(vp, m.overlayClass));
        }
        setActiveMasks([]);
        onMaskReady?.(false);
    };

    const toggleMask = (index) => {
        setActiveMasks(prev => {
            const updated = [...prev];
            const mask = updated[index];
            const newVisible = !mask.visible;
            setMaskOverlayVisible(getViewport(), newVisible, mask.overlayClass);
            updated[index] = { ...mask, visible: newVisible };
            return updated;
        });
    };

    // Cached modality+orientation detection — only hits the backend once per study.
    // Keyed on the first DICOM URL + count so it auto-invalidates when the study changes.
    const detectStudyInfo = async (dicomUrls, { showStep = true } = {}) => {
        const cacheKey = dicomUrls.length > 0
            ? `${dicomUrls[0]}|${dicomUrls.length}`
            : null;

        if (cacheKey && studyCacheRef.current?.key === cacheKey) {
            const cached = studyCacheRef.current;
            if (showStep) {
                addStep({
                    type: 'modality',
                    label: 'Detecting modality',
                    status: 'done',
                    result: `${cached.modality} — ${cached.orientation} (cached)`,
                });
            }
            return cached;
        }

        if (showStep) {
            addStep({ type: 'modality', label: 'Detecting modality', status: 'running', result: null });
        }

        let result = { modality: 'Unknown', orientation: 'axial', confidence: 0, reasoning: '' };
        try {
            const resp = await fetch(`${BASE_URL}/detect-modality`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dicom_urls: dicomUrls }),
            });
            if (resp.ok) {
                const data = await resp.json();
                result = {
                    modality: data.modality || 'Unknown',
                    orientation: data.orientation || 'axial',
                    confidence: data.confidence || 0,
                    reasoning: data.reasoning || '',
                };
            }
        } catch (err) {
            console.warn('Modality detection failed:', err);
        }

        if (cacheKey) {
            studyCacheRef.current = { key: cacheKey, ...result };
        }

        if (showStep) {
            updateLastStep({
                status: 'done',
                result: `${result.modality} (${(result.confidence * 100).toFixed(0)}% confidence), ${result.orientation}`,
            });
        }

        return result;
    };

    // Adds a step to the last (in-progress) assistant message
    const addStep = (step) => {
        setMessages(prev => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant' && last._pending) {
                return [...msgs.slice(0, -1), {
                    ...last,
                    steps: [...(last.steps || []), step]
                }];
            }
            return msgs;
        });
        return step; // return ref so caller can mutate
    };

    // Updates the last step of the pending assistant message
    const updateLastStep = (patch) => {
        setMessages(prev => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant' && last._pending && last.steps?.length) {
                const steps = [...last.steps];
                steps[steps.length - 1] = { ...steps[steps.length - 1], ...patch };
                return [...msgs.slice(0, -1), { ...last, steps }];
            }
            return msgs;
        });
    };

    // Finalises the pending assistant message with content
    const finaliseMessage = (content) => {
        setMessages(prev => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant' && last._pending) {
                return [...msgs.slice(0, -1), { ...last, content, _pending: false }];
            }
            return msgs;
        });
    };

    // ── Share session ─────────────────────────────────────────────────────────
    const handleShareSession = async () => {
        if (!userData || !supabaseClient) {
            toast.error('You need to be logged in to share sessions.');
            return null;
        }
        if (userData.is_anonymous) {
            toast.error('Please sign in to create a shared session.');
            return null;
        }
        try {
            const queryParams = new URLSearchParams(window.location.search);
            await supabaseClient.from('viewbox').delete().eq('user', userData.id);
            const { data, error } = await supabaseClient
                .from('viewbox')
                .upsert([{
                    user: userData.id,
                    url_params: queryParams.toString(),
                    visibility: Visibility.PUBLIC,
                    mode: Mode.TEAM,
                }])
                .select();
            if (error) throw error;
            if (data?.length > 0) {
                const sessionId = data[0].session_id;
                const p = new URLSearchParams();
                p.set('s', sessionId);
                const shareLink = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
                try {
                    await navigator.clipboard.writeText(shareLink);
                } catch (_) { }
                // Join the session reactively — no page reload needed
                dispatch?.({
                    type: 'connect_to_sharing_session',
                    payload: { sessionId, mode: 'TEAM', owner: userData.id },
                });
                toast.success('Share link copied to clipboard!');
                return shareLink;
            }
        } catch (err) {
            console.error('Share failed:', err);
            toast.error('Failed to create shared session.');
        }
        return null;
    };

    // ── Agent dispatch ────────────────────────────────────────────────────────
    const runAgent = async (userMessage, history) => {
        const viewport = getViewport();
        const dicomUrls = getDicomUrls(viewport);

        // ── Step 1: Route intent (silent — no UI bubble) ─────────────────────
        let action = 'chat';
        let params = { query: userMessage };

        try {
            // Clean history for routing — strip internal fields, truncate long AI responses
            const cleanHistory = history
                .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
                .map(m => ({
                    role: m.role,
                    content: m.content.slice(0, 300) // truncate long AI outputs
                }));

            const routeResp = await fetch(`${BASE_URL}/agent-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage, history: cleanHistory })
            });
            if (routeResp.ok) {
                const routeData = await routeResp.json();
                action = routeData.action || 'chat';
                params = routeData.params || { query: userMessage };
            }
        } catch (err) {
            console.warn('Route failed, falling back to chat:', err);
        }

        // ── Client-side fallback: catch missed explain_finding ────────────────
        // If router said 'chat' but message clearly references a radiology finding/report
        // AND there's no prior assistant message (so it's not a follow-up), override.
        if (action === 'chat') {
            const hasPriorAssistant = history.some(m => m.role === 'assistant' && m.content);
            const findingKeywords = /radiology\s*report|impression|finding|opacity|nodule|lesion|effusion|infiltrat|consolidat|mass|atelectasis|pneumonia|explain\s+(my|the|this)\s+(report|scan|finding|impression)/i;
            if (!hasPriorAssistant && findingKeywords.test(userMessage)) {
                action = 'explain_finding';
                params = { ...params, finding: userMessage };
            }
        }

        // ── Step 2: Execute action ────────────────────────────────────────────
        let reply = '';

        try {
            if (action === 'adjust_window') {
                const { modality: winModality } = await detectStudyInfo(dicomUrls);

                if (winModality !== 'CT') {
                    reply = `Window/level adjustment is only available for **CT scans**. The current study appears to be **${winModality}**, which doesn't use Hounsfield Unit windowing.`;
                } else {
                    addStep({ type: 'windowing', label: 'Adjusting window', status: 'running', result: null });
                    const winResp = await fetch(`${BASE_URL}/check-window`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: userMessage })
                    });
                    if (!winResp.ok) throw new Error('Window check failed');
                    const winData = await winResp.json();

                    if (winData.action?.type === 'set_window_level' && viewport) {
                        const { window: ww, level: wl, name } = winData.action;
                        await applyWindowing(viewport, ww, wl);
                        updateLastStep({ status: 'done', result: `Applied: ${name || 'Custom'} (W:${ww} / L:${wl})` });
                        reply = `**Window adjusted** to **${name || 'Custom'}** (W:${ww} / L:${wl}).\n\n${winData.thought || ''}`;
                    } else {
                        updateLastStep({ status: 'done', result: 'No window change needed.' });
                        reply = winData.thought || 'No windowing adjustment was needed for this request.';
                    }
                }

            } else if (action === 'explain_finding') {
                const findingText = params?.finding || userMessage;

                if (!dicomUrls.length) {
                    addStep({ type: 'summary', label: 'No DICOM loaded', status: 'error', result: 'Load a study first.' });
                    reply = 'No imaging study is currently loaded. Please load a DICOM study first.';
                } else {
                    const imageIds = viewport.getImageIds();

                    // ── 1. Detect modality ────────────────────────────────────
                    const { modality, orientation } = await detectStudyInfo(dicomUrls);

                    // ── 2. Windowing (CT or X-Ray only) ──────────────────────
                    if (modality === 'CT') {
                        addStep({ type: 'windowing', label: `Optimizing ${modality} window`, status: 'running', result: null });
                        try {
                            const winResp = await fetch(`${BASE_URL}/check-window`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: `Show me the ${findingText}` })
                            });
                            if (winResp.ok) {
                                const winData = await winResp.json();
                                if (winData.action?.type === 'set_window_level' && viewport) {
                                    const { window: ww, level: wl, name } = winData.action;
                                    await applyWindowing(viewport, ww, wl);
                                    updateLastStep({ status: 'done', result: `${name || 'Custom'} (W:${ww} / L:${wl})` });
                                } else {
                                    updateLastStep({ status: 'done', result: 'No window change needed' });
                                }
                            } else {
                                updateLastStep({ status: 'done', result: 'Skipped' });
                            }
                        } catch (err) {
                            updateLastStep({ status: 'done', result: 'Windowing skipped' });
                        }
                    }

                    // ── 3. Segment (CT or MRI only) ───────────────────────────
                    let summaryDicomUrls = null;

                    if (['CT', 'MRI', 'MR'].includes(modality)) {
                        addStep({ type: 'segmentation', label: 'Identifying structures in finding', status: 'running', result: null });
                        let structures = [];
                        try {
                            const identResp = await fetch(`${BASE_URL}/identify_structure`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: findingText })
                            });
                            if (identResp.ok) {
                                const identData = await identResp.json();
                                structures = identData.structures || (identData.structure ? [identData.structure] : []);
                            }
                        } catch (_) { }

                        if (!structures.length) {
                            updateLastStep({ status: 'done', result: 'No specific structure identified' });
                        } else {
                            updateLastStep({ status: 'done', result: `Structures: ${structures.map(friendlyStructureLabel).join(', ')}` });
                            addStep({ type: 'segmentation', label: `Segmenting ${structures.length} structure(s)`, status: 'running', result: null });

                            try {
                                const segResp = await fetch(`${BASE_URL}/segment_dicom`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dicom_urls: dicomUrls, structures, modality, orientation })
                                });
                                if (!segResp.ok) throw new Error('Segmentation request failed');
                                const segData = await segResp.json();
                                const foundResults = (segData.results || []).filter(r => r.found);

                                if (foundResults.length > 0) {
                                    clearAllMasks();
                                    const maskTransform = getMaskTransform(segData.orientation || orientation);
                                    const newMasks = [];

                                    foundResults.forEach((res, i) => {
                                        const overlayClass = `medgemma-mask-${i}`;
                                        const colorHex = MASK_COLORS[i % MASK_COLORS.length];
                                        drawRleMaskOverlay({
                                            viewport, volumeMaskRle: res.mask_rle, shape: res.shape,
                                            overlayClass, colorHex, ...maskTransform,
                                        });
                                        setMaskOverlayVisible(viewport, true, overlayClass);
                                        newMasks.push({
                                            structure: res.structure, overlayClass, colorHex,
                                            visible: true, label: friendlyStructureLabel(res.structure),
                                        });
                                    });

                                    setActiveMasks(newMasks);
                                    onMaskReady?.(true);

                                    // Navigate to first structure's centroid
                                    const first = foundResults[0];
                                    const D = first.shape[2];
                                    const rawZ = maskTransform.flipZ
                                        ? (D - 1 - Math.round(first.centroid_voxel[2]))
                                        : Math.round(first.centroid_voxel[2]);
                                    const sliceIdx = Math.max(0, Math.min(rawZ - (maskTransform.zOffset || 0), imageIds.length - 1));
                                    const cam = viewport.getCamera();
                                    viewport.setImageIdIndex(sliceIdx);
                                    viewport.setCamera(cam);
                                    viewport.render();

                                    // Collect which viewport slices contain mask data (all structures combined).
                                    // Uses modular arithmetic per RLE run instead of iterating every voxel.
                                    const allSlices = new Set();
                                    foundResults.forEach(res => {
                                        const D = res.shape[2];
                                        for (let i = 0; i < res.mask_rle.length; i += 2) {
                                            const start = res.mask_rle[i], len = res.mask_rle[i + 1];
                                            if (len >= D) {
                                                for (let z = 0; z < D; z++) {
                                                    const rz = maskTransform.flipZ ? (D - 1 - z) : z;
                                                    const idx = rz - (maskTransform.zOffset || 0);
                                                    if (idx >= 0) allSlices.add(idx);
                                                }
                                            } else {
                                                const zStart = start % D;
                                                const zEnd = (start + len - 1) % D;
                                                const addZ = (z) => {
                                                    const rz = maskTransform.flipZ ? (D - 1 - z) : z;
                                                    const idx = rz - (maskTransform.zOffset || 0);
                                                    if (idx >= 0) allSlices.add(idx);
                                                };
                                                if (zStart <= zEnd) {
                                                    for (let z = zStart; z <= zEnd; z++) addZ(z);
                                                } else {
                                                    for (let z = zStart; z < D; z++) addZ(z);
                                                    for (let z = 0; z <= zEnd; z++) addZ(z);
                                                }
                                            }
                                        }
                                    });
                                    const sorted = Array.from(allSlices).sort((a, b) => a - b);
                                    const pickSlices = (slices, n = 15) => {
                                        if (!slices.length) return [sliceIdx];
                                        if (slices.length <= n) return slices;
                                        const step = (slices.length - 1) / (n - 1);
                                        return Array.from({ length: n }, (_, i) => slices[Math.round(i * step)]);
                                    };
                                    const picked = pickSlices(sorted);
                                    summaryDicomUrls = picked.map(idx =>
                                        imageIds[Math.max(0, Math.min(idx, imageIds.length - 1))].replace(/^dicomweb:/, '')
                                    );
                                    const names = foundResults.map(r => friendlyStructureLabel(r.structure)).join(', ');
                                    updateLastStep({ status: 'done', result: `${names} segmented — ${picked.length} slices selected` });
                                } else {
                                    updateLastStep({ status: 'done', result: 'No structures found, using nearby slices' });
                                }
                            } catch (segErr) {
                                updateLastStep({ status: 'done', result: `Segmentation failed: ${segErr.message}` });
                            }
                        }
                    }

                    // ── 4. Summarize ──────────────────────────────────────────
                    // Fallback: use ±5 slices around current if no mask slices
                    if (!summaryDicomUrls) {
                        const currentIdx = viewport.getCurrentImageIdIndex();
                        const total = imageIds.length;
                        const indices = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
                            .map(d => currentIdx + d)
                            .filter(i => i >= 0 && i < total);
                        summaryDicomUrls = indices.map(i => imageIds[i].replace(/^dicomweb:/, ''));
                    }

                    addStep({ type: 'summary', label: `Generating analysis from ${summaryDicomUrls.length} slices`, status: 'running', result: null });
                    try {
                        const resp = await fetch(`${BASE_URL}/summary-multi`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                dicom_urls: summaryDicomUrls,
                                text: `Analyze this ${modality} finding: "${findingText}"`
                            })
                        });
                        if (!resp.ok) throw new Error('Summary failed');
                        const summaryData = await resp.json();
                        reply = summaryData.summary || 'No summary generated.';
                        updateLastStep({ status: 'done', result: `Analysis complete` });
                    } catch (sumErr) {
                        updateLastStep({ status: 'error', result: sumErr.message });
                        reply = `Analysis failed: ${sumErr.message}`;
                    }
                }


            } else if (action === 'detect_modality') {
                if (!dicomUrls.length) {
                    addStep({ type: 'modality', label: 'Detecting modality', status: 'error', result: 'No DICOM loaded.' });
                    reply = 'No imaging study is currently loaded.';
                } else {
                    const info = await detectStudyInfo(dicomUrls);
                    const confidence = (info.confidence * 100).toFixed(0);
                    reply = `**Modality detected: ${info.modality}** (${confidence}% confidence)\n**Orientation: ${info.orientation}**\n\n${info.reasoning}`;
                }

            } else if (action === 'show_organ') {
                const structureHint = params?.structure || userMessage;
                addStep({ type: 'segmentation', label: `Identifying structure: "${structureHint}"`, status: 'running', result: null });

                if (!dicomUrls.length) {
                    updateLastStep({ status: 'error', result: 'No DICOM loaded.' });
                    reply = 'No imaging study is currently loaded.';
                } else {
                    const { modality: detectedModality, orientation: detectedOrientation } = await detectStudyInfo(dicomUrls, { showStep: false });

                    // Identify structure(s)
                    const identResp = await fetch(`${BASE_URL}/identify_structure`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: structureHint })
                    });
                    if (!identResp.ok) throw new Error('Structure identification failed');
                    const identData = await identResp.json();
                    const structures = identData.structures || (identData.structure ? [identData.structure] : []);

                    if (!structures.length) {
                        updateLastStep({ status: 'done', result: 'No structure identified.' });
                        reply = `I couldn't identify a specific anatomical structure from "${structureHint}". Try being more specific (e.g., "show me the liver" or "highlight the left kidney").`;
                    } else {
                        const labels = structures.map(friendlyStructureLabel).join(', ');
                        updateLastStep({ status: 'done', result: `Structures: ${labels}` });
                        addStep({ type: 'segmentation', label: `Segmenting ${structures.length > 1 ? `${structures.length} structures` : labels}…`, status: 'running', result: null });

                        const segResp = await fetch(`${BASE_URL}/segment_dicom`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dicom_urls: dicomUrls, structures, modality: detectedModality, orientation: detectedOrientation })
                        });
                        if (!segResp.ok) throw new Error('Segmentation failed');
                        const segData = await segResp.json();

                        if (segData.error) throw new Error(segData.error);

                        const foundResults = (segData.results || []).filter(r => r.found);

                        if (!foundResults.length) {
                            updateLastStep({ status: 'done', result: `No structures found in this study.` });
                            reply = `The requested structure(s) could not be segmented in this study. They may not be visible in the current imaging plane.`;
                        } else {
                            clearAllMasks();
                            const maskTransform = getMaskTransform(segData.orientation || detectedOrientation);
                            const newMasks = [];

                            foundResults.forEach((res, i) => {
                                const overlayClass = `medgemma-mask-${i}`;
                                const colorHex = MASK_COLORS[i % MASK_COLORS.length];
                                drawRleMaskOverlay({
                                    viewport, volumeMaskRle: res.mask_rle, shape: res.shape,
                                    overlayClass, colorHex, ...maskTransform,
                                });
                                setMaskOverlayVisible(viewport, true, overlayClass);
                                newMasks.push({
                                    structure: res.structure, overlayClass, colorHex,
                                    visible: true, label: friendlyStructureLabel(res.structure),
                                });
                            });

                            setActiveMasks(newMasks);
                            onMaskReady?.(true);

                            // Navigate to first structure's centroid
                            const imageIds = viewport.getImageIds();
                            const first = foundResults[0];
                            const D = first.shape[2];
                            const voxelZ = first.centroid_voxel[2];
                            const rawZ = maskTransform.flipZ ? (D - 1 - Math.round(voxelZ)) : Math.round(voxelZ);
                            const sliceIdx = Math.max(0, Math.min(rawZ - (maskTransform.zOffset || 0), imageIds.length - 1));
                            const cam = viewport.getCamera();
                            viewport.setImageIdIndex(sliceIdx);
                            viewport.setCamera(cam);
                            viewport.render();

                            const names = foundResults.map(r => friendlyStructureLabel(r.structure)).join(', ');
                            updateLastStep({ status: 'done', result: `${names} segmented` });
                            reply = `**${names}** ${foundResults.length > 1 ? 'have' : 'has'} been highlighted on the viewport. Use the structure toggles to show/hide individual masks.`;
                        }
                    }
                }

            } else if (action === 'generate_share') {
                addStep({ type: 'share', label: 'Generating share link', status: 'running', result: null });
                const link = await handleShareSession();
                if (link) {
                    updateLastStep({ status: 'done', result: link });
                    reply = `**Share link created and copied to clipboard!**\n\n\`${link}\`\n\nAnyone with this link can view the current imaging session.`;
                } else {
                    updateLastStep({ status: 'error', result: 'Share failed.' });
                    reply = 'Failed to generate a share link. Make sure you are logged in.';
                }

            } else {
                // Plain chat
                const chatResp = await fetch(`${BASE_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: history.filter(m => m.role === 'user' || m.role === 'assistant')
                    })
                });
                if (!chatResp.ok) throw new Error('Chat failed');
                const chatData = await chatResp.json();
                reply = chatData.response || 'No response.';
            }
        } catch (err) {
            console.error('Agent error:', err);
            updateLastStep({ status: 'error', result: err.message });
            reply = `Sorry, I ran into an error: ${err.message}`;
        }

        return reply;
    };

    // ── Submit handler ────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || chatLoading) return;

        const userMsg = { role: 'user', content: chatInput };
        const history = [...messages, userMsg];
        setMessages([...history, { role: 'assistant', content: '', steps: [], _pending: true }]);
        setChatInput('');
        setChatLoading(true);

        try {
            const reply = await runAgent(chatInput, history);
            finaliseMessage(reply);
        } catch (err) {
            finaliseMessage(`Sorry, something went wrong: ${err.message}`);
        } finally {
            setChatLoading(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-950">
            <ScrollArea className="flex-1 bg-slate-950/20">
                <div className="p-2 space-y-3 pb-2">
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} msg={msg} />
                    ))}

                    {/* Share button — only when logged in and enough messages */}
                    {userData && messages.filter(m => !m._pending).length > 2 && !chatLoading && (
                        <div className="flex justify-end px-1 pt-1">
                            <button
                                onClick={handleShareSession}
                                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                            >
                                <Share className="h-3 w-3" /> Share with care team
                            </button>
                        </div>
                    )}

                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Mask structure toggles */}
            {activeMasks.length > 0 && (
                <div className="px-2 py-1.5 bg-slate-950/80 border-t border-slate-800/50 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[9px] text-slate-600 font-medium uppercase tracking-wider mr-0.5">Masks</span>
                    {activeMasks.map((mask, i) => (
                        <button
                            key={mask.overlayClass}
                            onClick={() => toggleMask(i)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                                mask.visible
                                    ? 'bg-slate-800 border-slate-600 text-slate-200'
                                    : 'bg-slate-900 border-slate-800 text-slate-500'
                            }`}
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: mask.visible ? mask.colorHex : '#475569' }}
                            />
                            {mask.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="p-2 bg-slate-950 border-t border-slate-800">
                <form onSubmit={handleSubmit} className="flex gap-2 items-end relative">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Ask anything, or say 'show me the liver'…"
                        disabled={chatLoading}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
                        className="flex-1 pr-8 py-1.5 px-3 text-xs bg-slate-900/50 text-slate-100 border border-slate-800 rounded-lg placeholder:text-slate-500 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-blue-500/30 leading-relaxed disabled:opacity-50"
                        style={{ minHeight: '32px' }}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!chatInput.trim() || chatLoading}
                        className="absolute right-1 bottom-1 h-7 w-7 text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                        variant="ghost"
                    >
                        {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                </form>
                {/* Capability hints */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                        'Adjust window',
                        'Show an organ',
                        'Explain a finding',
                        'Share session',
                    ].map(hint => (
                        <button
                            key={hint}
                            onClick={() => setChatInput(hint)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
                        >
                            {hint}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
