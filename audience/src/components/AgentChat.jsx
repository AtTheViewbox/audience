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
} from '../lib/medgemma-utils';

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
    const scrollRef = useRef(null);
    const textareaRef = useRef(null);

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
                // Detect modality first — windowing only applies to CT
                addStep({ type: 'modality', label: 'Detecting modality', status: 'running', result: null });
                let winModality = 'Unknown';
                try {
                    const modResp = await fetch(`${BASE_URL}/detect-modality`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dicom_urls: dicomUrls })
                    });
                    if (modResp.ok) {
                        const modData = await modResp.json();
                        winModality = modData.modality || 'Unknown';
                    }
                } catch (_) { }
                updateLastStep({ status: 'done', result: `Modality: ${winModality}` });

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
                    addStep({ type: 'modality', label: 'Detecting modality', status: 'running', result: null });
                    let modality = 'Unknown';
                    try {
                        const modResp = await fetch(`${BASE_URL}/detect-modality`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dicom_urls: dicomUrls })
                        });
                        if (modResp.ok) {
                            const modData = await modResp.json();
                            modality = modData.modality || 'Unknown';
                            updateLastStep({ status: 'done', result: `${modality} (${((modData.confidence || 0) * 100).toFixed(0)}% confidence)` });
                        } else {
                            updateLastStep({ status: 'done', result: 'Modality unknown' });
                        }
                    } catch (err) {
                        updateLastStep({ status: 'done', result: 'Modality detection failed, continuing...' });
                    }

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
                    let summaryDicomUrls = null; // will be set from mask slices or fallback

                    if (['CT', 'MRI', 'MR'].includes(modality)) {
                        // Identify structure
                        addStep({ type: 'segmentation', label: `Identifying structure in finding`, status: 'running', result: null });
                        let structure = null;
                        try {
                            const identResp = await fetch(`${BASE_URL}/identify_structure`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: findingText })
                            });
                            if (identResp.ok) {
                                const identData = await identResp.json();
                                structure = identData.structure || null;
                            }
                        } catch (_) { }

                        if (!structure) {
                            updateLastStep({ status: 'done', result: 'No specific structure identified' });
                        } else {
                            updateLastStep({ status: 'done', result: `Structure: ${structure}` });
                            addStep({ type: 'segmentation', label: `Segmenting ${structure}`, status: 'running', result: null });

                            try {
                                const segResp = await fetch(`${BASE_URL}/segment_dicom`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dicom_urls: dicomUrls, structure, modality })
                                });
                                if (!segResp.ok) throw new Error('Segmentation request failed');
                                const segData = await segResp.json();

                                if (segData.found && !segData.error) {
                                    const { mask_rle, shape, centroid_voxel } = segData;

                                    // Draw overlay
                                    drawRleMaskOverlay({
                                        viewport,
                                        volumeMaskRle: mask_rle,
                                        shape,
                                        overlayClass: 'medgemma-overlay',
                                        ...DEFAULT_MASK_XFORM
                                    });
                                    setMaskOverlayVisible(viewport, true, 'medgemma-overlay');
                                    onMaskReady?.(true);

                                    // Navigate to centroid
                                    const D = shape[2];
                                    const rawZ = DEFAULT_MASK_XFORM.flipZ
                                        ? (D - 1 - Math.round(centroid_voxel[2]))
                                        : Math.round(centroid_voxel[2]);
                                    const sliceIdx = Math.max(0, Math.min(rawZ - (DEFAULT_MASK_XFORM.zOffset || 0), imageIds.length - 1));
                                    const cam = viewport.getCamera();
                                    viewport.setImageIdIndex(sliceIdx);
                                    viewport.setCamera(cam);
                                    viewport.render();

                                    // Pick up to 15 evenly-spaced mask slices for summary
                                    const getRelevantSlices = (rle, sh) => {
                                        const [, , D] = sh;
                                        const slices = new Set();
                                        for (let i = 0; i < rle.length; i += 2) {
                                            const start = rle[i], len = rle[i + 1];
                                            for (let p = start; p < start + len; p++) {
                                                const zVol = p % D;
                                                const rawZ = DEFAULT_MASK_XFORM.flipZ ? (D - 1 - zVol) : zVol;
                                                const idx = rawZ - (DEFAULT_MASK_XFORM.zOffset || 0);
                                                if (idx >= 0) slices.add(idx);
                                            }
                                        }
                                        return Array.from(slices).sort((a, b) => a - b);
                                    };
                                    const maskSlices = getRelevantSlices(mask_rle, shape);
                                    const pickSlices = (slices, n = 15) => {
                                        if (!slices.length) return [sliceIdx];
                                        if (slices.length <= n) return slices;
                                        const step = (slices.length - 1) / (n - 1);
                                        return Array.from({ length: n }, (_, i) => slices[Math.round(i * step)]);
                                    };
                                    const picked = pickSlices(maskSlices);
                                    summaryDicomUrls = picked.map(idx =>
                                        imageIds[Math.max(0, Math.min(idx, imageIds.length - 1))].replace(/^dicomweb:/, '')
                                    );
                                    updateLastStep({ status: 'done', result: `${structure} segmented — ${picked.length} slices selected` });
                                } else {
                                    updateLastStep({ status: 'done', result: `${structure} not found, using nearby slices` });
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
                addStep({ type: 'modality', label: 'Detecting modality', status: 'running', result: null });

                if (!dicomUrls.length) {
                    updateLastStep({ status: 'error', result: 'No DICOM loaded.' });
                    reply = 'No imaging study is currently loaded.';
                } else {
                    const modResp = await fetch(`${BASE_URL}/detect-modality`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dicom_urls: dicomUrls })
                    });
                    if (!modResp.ok) throw new Error('Modality detection failed');
                    const modData = await modResp.json();
                    const modality = modData.modality || 'Unknown';
                    const confidence = ((modData.confidence || 0) * 100).toFixed(0);
                    updateLastStep({ status: 'done', result: `${modality} (${confidence}% confidence)` });
                    reply = `**Modality detected: ${modality}** (${confidence}% confidence)\n\n${modData.reasoning || ''}`;
                }

            } else if (action === 'show_organ') {
                const structureHint = params?.structure || userMessage;
                addStep({ type: 'segmentation', label: `Identifying structure: "${structureHint}"`, status: 'running', result: null });

                if (!dicomUrls.length) {
                    updateLastStep({ status: 'error', result: 'No DICOM loaded.' });
                    reply = 'No imaging study is currently loaded.';
                } else {
                    // Identify structure
                    const identResp = await fetch(`${BASE_URL}/identify_structure`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: structureHint })
                    });
                    if (!identResp.ok) throw new Error('Structure identification failed');
                    const identData = await identResp.json();
                    const structure = identData.structure;

                    if (!structure) {
                        updateLastStep({ status: 'done', result: 'No structure identified.' });
                        reply = `I couldn't identify a specific anatomical structure from "${structureHint}". Try being more specific (e.g., "show me the liver" or "highlight the left kidney").`;
                    } else {
                        updateLastStep({ status: 'done', result: `Structure: ${structure}` });
                        addStep({ type: 'segmentation', label: `Segmenting ${structure}…`, status: 'running', result: null });

                        const segResp = await fetch(`${BASE_URL}/segment_dicom`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dicom_urls: dicomUrls, structure })
                        });
                        if (!segResp.ok) throw new Error('Segmentation failed');
                        const segData = await segResp.json();

                        if (segData.error) throw new Error(segData.error);

                        if (!segData.found) {
                            updateLastStep({ status: 'done', result: `${structure} not found in this study.` });
                            reply = `The **${structure}** could not be segmented in this study. It may not be visible in the current imaging plane.`;
                        } else {
                            const { mask_rle, shape, centroid_voxel } = segData;

                            // Draw overlay
                            drawRleMaskOverlay({
                                viewport,
                                volumeMaskRle: mask_rle,
                                shape,
                                overlayClass: 'medgemma-overlay',
                                ...DEFAULT_MASK_XFORM
                            });
                            setMaskOverlayVisible(viewport, true, 'medgemma-overlay');

                            // Navigate to centroid
                            const imageIds = viewport.getImageIds();
                            const D = shape[2];
                            const voxelZ = centroid_voxel[2];
                            const rawZ = DEFAULT_MASK_XFORM.flipZ ? (D - 1 - Math.round(voxelZ)) : Math.round(voxelZ);
                            const sliceIdx = Math.max(0, Math.min(rawZ - (DEFAULT_MASK_XFORM.zOffset || 0), imageIds.length - 1));
                            const localIndex = imageIds.indexOf(imageIds[sliceIdx]);
                            if (localIndex !== -1) {
                                const cam = viewport.getCamera();
                                viewport.setImageIdIndex(localIndex);
                                viewport.setCamera(cam);
                                viewport.render();
                            }

                            // Notify parent to show mask toggle
                            onMaskReady?.(true);

                            updateLastStep({ status: 'done', result: `${structure} segmented — mask drawn on viewport` });
                            reply = `**${structure}** has been highlighted on the viewport. Use the **mask toggle** in the header to show/hide it.`;
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
                        'Detect modality',
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
