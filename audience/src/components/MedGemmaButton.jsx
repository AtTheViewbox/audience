import { useState, useContext, useRef } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, Eye, Send, User, Bot } from 'lucide-react';
import { DataContext, DataDispatchContext } from '../context/DataContext';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

export default function MedGemmaButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I'm MedGemma (27B). Ask me any medical questions." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const BASE_URL = `https://mfei1225--medgemma-dual-agent-v11-api-dev.modal.run`;

  // --- SEMANTIC NAVIGATION STATE ---
  const indexMapRef = useRef({
    cranialDeltaSign: null, // -1 or +1 once learned
  });

  const regionRank = (region) => {
    const order = ["Brain", "Neck", "Chest", "Upper Abdomen", "Mid Abdomen", "Pelvis", "Lower Extremity"];
    const i = order.indexOf(region);
    return i === -1 ? null : i;
  };

  const learnCranialSign = (prevRegion, nextRegion, stepDelta) => {
    const a = regionRank(prevRegion);
    const b = regionRank(nextRegion);
    if (a == null || b == null) return;

    // moving cranial means rank should DECREASE (e.g., Mid Abdomen -> Chest)
    const movedCranial = b < a;
    const sign = Math.sign(stepDelta);

    if (movedCranial && sign !== 0) {
      indexMapRef.current.cranialDeltaSign = sign; // "this sign moves cranial"
      console.log(`LEARNED CRANIAL SIGN: ${sign} (moved ${prevRegion} -> ${nextRegion})`);
    }
  };

  const { renderingEngine } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);

  // Convert canvas to base64 image
  const getImageAsBase64 = async (viewport) => {
    try {
      const canvas = viewport.getCanvas();
      if (!canvas) {
        throw new Error('No canvas found');
      }

      // Convert canvas to blob then to base64
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'));
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            // Extract base64 data (remove data:image/png;base64, prefix)
            const base64 = reader.result.split(',')[1];
            console.log(`Captured Image: ${canvas.width}x${canvas.height}, Base64 Length: ${base64.length}`);
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/png');
      });
    } catch (error) {
      console.error('Error converting image:', error);
      throw error;
    }
  };

  // --- UI STATE ---
  const [activeTab, setActiveTab] = useState("pipeline"); // 'pipeline' | 'chat'
  const [pipelineMode, setPipelineMode] = useState("input"); // 'input' | 'select' | 'run'
  const [findings, setFindings] = useState([]);
  const [reportInput, setReportInput] = useState("");
  const [currentFinding, setCurrentFinding] = useState("");

  // --- AGENT STATE ---
  const [steps, setSteps] = useState([]); // [{ type: 'thought'|'action', content: string }]
  const [isLooping, setIsLooping] = useState(false);
  const stopRef = useRef(false);

  // --- PARSING LOGIC ---
  const parseFindings = (text) => {
    if (!text) return [];
    // Split by newlines, bullets, or numbers
    const lines = text.split(/\r?\n/);
    const extracted = lines
      .map(line => line.trim())
      .filter(line => {
        // Simple heuristic: Line starts with -, *, or digit+dot, or is just a non-empty line
        // We want to filter out empty lines or very short meaningless lines
        return line.length > 5;
      })
      .map(line => {
        // Remove leading bullets/numbers for cleaner display
        return line.replace(/^[\-\*•\d\.]+\s*/, '');
      });
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
    setPipelineMode("run");
    handleStart(finding);
  };

  const handleStop = () => {
    stopRef.current = true;
    setIsLooping(false);
    setSteps(prev => [...prev, { type: 'error', content: 'Stopped by user.' }]);
  };

  const MAX_STEPS = 10;

  // Execute agentic action returned by backend
  const executeAction = async (action, viewport) => {
    if (!action || !viewport) return false;

    console.log("Executing agent action:", action);

    try {
      if (action.type === 'set_window_level') {
        let { window: wwHU, level: wcHU } = action;

        // Get metadata for inverse conversion
        const imageId = viewport.getCurrentImageId();
        let slope = 1;
        let intercept = 0;

        // Try to get from cached image object first (most reliable)
        const image = cornerstone.cache.getImage(imageId);
        if (image) {
          slope = image.slope !== undefined ? image.slope : (image.intercept?.slope ?? 1);
          intercept = image.intercept !== undefined ? image.intercept : (image.intercept?.intercept ?? 0);
        } else {
          // Fallback to metadata provider
          const modalityLut = cornerstone.metaData.get('modalityLutModule', imageId) || {};
          slope = modalityLut.rescaleSlope ?? 1;
          intercept = modalityLut.rescaleIntercept ?? 0;
        }

        // Convert Hounsfield Units from AI back to Stored Values for the viewer
        // SV = (HU - intercept) / slope
        // For width, only slope applies
        const wwSV = wwHU / slope;
        const wcSV = (wcHU - intercept) / slope;

        viewport.setProperties({
          voiRange: cornerstone.utilities.windowLevel.toLowHighRange(wwSV, wcSV)
        });
        viewport.render();

        return true;
      }

      if (action.type === 'scroll_delta' || action.type === "scroll_cranial" || action.type === "scroll_caudal") {
        let step = 0;

        if (action.type === 'scroll_delta') {
          step = parseInt(action.step, 10);
        } else {
          // SEMANTIC ACTION
          const rawStep = Number(action.step ?? 10);
          if (!Number.isFinite(rawStep) || rawStep <= 0) return false;

          // If we haven't learned mapping yet, probe with -1 first (standard DICOM) and learn from region change next step.
          const cranialSign = indexMapRef.current.cranialDeltaSign ?? -1;

          step = action.type === "scroll_cranial"
            ? cranialSign * rawStep
            : -cranialSign * rawStep;
        }

        if (isNaN(step) || step === 0) return false;

        const currentIndex = viewport.getCurrentImageIdIndex();
        const imageIds = viewport.getImageIds();
        const newIndex = currentIndex + step;
        const safeIndex = Math.max(0, Math.min(newIndex, imageIds.length - 1));

        if (currentIndex === safeIndex) {
          const atStart = currentIndex === 0;
          const atEnd = currentIndex === imageIds.length - 1;

          return {
            ok: false,
            reason: "hit_boundary",
            current: currentIndex,
            total: imageIds.length,
            step,
            atStart,
            atEnd,
          };
        }

        viewport.setImageIdIndex(safeIndex);
        viewport.render();

        // Sync context to prevent reset on re-render
        const targetImageId = imageIds[safeIndex];
        const getInstanceNumber = (str) => {
          const match = str.match(/(\d+)(?!.*\d)/);
          return match ? parseInt(match[0], 10) : null;
        };
        const ci = getInstanceNumber(targetImageId);

        if (ci !== null) {
          dispatch({
            type: 'update_viewport_ci',
            payload: { viewport_idx: 0, ci }
          });
        }

        return true;
      } else if (action.type === 'scroll_to_slice') {
        const { index } = action;
        if (index !== undefined) {
          const imageIds = viewport.getImageIds();
          const safeIndex = Math.max(0, Math.min(index, imageIds.length - 1));

          if (viewport.getCurrentImageIdIndex() === safeIndex) {
            return false;
          }

          viewport.setImageIdIndex(safeIndex);
          viewport.render();
          return true;
        }
      }
    } catch (error) {
      console.error("Failed to execute action:", error);
    }
    console.warn("executeAction returning false (fallthrough)");
    return false;
  };

  const runAgentLoop = async (currentPrompt, iteration = 0, currentSteps = []) => {
    if (stopRef.current) return;

    if (iteration >= MAX_STEPS) {
      setSteps(prev => [...prev, { type: 'info', content: 'Max reasoning steps reached. Stopping.' }]);
      stopRef.current = true;
      setIsLooping(false);
      return;
    }

    try {
      if (!renderingEngine) throw new Error('No image loaded');
      const viewport = renderingEngine.getViewport('0-vp');
      if (!viewport) throw new Error('Viewport not found');

      // Add a small delay to ensure any previous rendering/state changes are settled
      await new Promise(r => setTimeout(r, 100));

      if (stopRef.current) return;

      // 1. Capture State & Image
      const imageBase64 = await getImageAsBase64(viewport);
      // ... (currentState capture logic unchanged) ...

      let currentState = null;
      try {
        const props = viewport.getProperties();
        const voiRange = props.voiRange;
        let windowWidth = 0, windowCenter = 0;

        if (voiRange) {
          const wl = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
          windowWidth = wl.windowWidth;
          windowCenter = wl.windowCenter;
        }

        const currentSlice = viewport.getCurrentImageIdIndex();
        const imageIds = viewport.getImageIds();

        // Get metadata for conversion (slope/intercept)
        const imageId = viewport.getCurrentImageId();
        let slope = 1, intercept = 0;
        const image = cornerstone.cache.getImage(imageId);
        if (image) {
          slope = image.slope ?? (image.intercept?.slope ?? 1);
          intercept = image.intercept ?? (image.intercept?.intercept ?? 0);
        }

        const windowWidthHU = windowWidth * slope;
        const windowCenterHU = windowCenter * slope + intercept;

        // CRITICAL: Total slices now comes from imageIds.length which is dense!
        currentState = {
          window_width: windowWidthHU,
          window_center: windowCenterHU,
          current_slice: currentSlice,
          total_slices: imageIds.length
        };
      } catch (e) {
        console.warn("State capture failed:", e);
      }

      // 2. Call Backend (New V10 Chained Endpoints)
      // const BASE_URL = `https://mfei1225--medgemma-dual-agent-v11-api-dev.modal.run`; // Moved to component scope


      // --- PHASE 1: PRE-CHECKS (Windowing - ONLY ON FIRST STEP) ---
      let windowAnalysis = "Not checked (persisted)";
      if (iteration === 0) {
        // Only check window on first step
        const windowResp = await fetch(`${BASE_URL}/check-window`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentPrompt
          })
        });
        if (!windowResp.ok) {
          const errorText = await windowResp.text();
          throw new Error(`Window API failed: ${windowResp.status} ${errorText}`);
        }
        const windowData = await windowResp.json();

        if (windowData.action && windowData.action.type === 'set_window_level') {
          await executeAction(windowData.action, viewport);

          // Add windowing as a distinct step in the UI
          const windowStep = {
            content: windowData.thought || `Applying ${windowData.action.name} preset.`,
            action: windowData.action,
            timestamp: new Date().toISOString()
          };
          setSteps(prev => [...prev, { type: 'agent', ...windowStep }]);

          windowAnalysis = `Applied ${windowData.action.name} (W: ${windowData.action.window}, L: ${windowData.action.level})`;
        } else {
          windowAnalysis = windowData.thought || "Default";
        }
      } else {
        // Retrieve previous window analysis if available, or just skip
        // For simplicity we just say it was done previously
        windowAnalysis = "Previously checked";
      }

      // --- PHASE 2: PERCEPTION ---
      if (stopRef.current) return;

      const perceptionResp = await fetch(`${BASE_URL}/perception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: imageBase64,
          text: currentPrompt,
        }),
      });

      // Read text first so you can debug non-JSON responses
      const perceptionText = await perceptionResp.text();

      if (!perceptionResp.ok) {
        throw new Error(
          `Perception API failed: ${perceptionResp.status} ${perceptionText.slice(0, 500)}`
        );
      }

      // Try parse JSON safely
      let perceptionData;
      try {
        perceptionData = JSON.parse(perceptionText);
      } catch (e) {
        throw new Error(
          `Perception returned non-JSON. First 500 chars:\n${perceptionText.slice(0, 500)}`
        );
      }

      /**
       * Supports BOTH backend contracts:
       * NEW: { ok: true, perception: {...} } OR { ok:false, raw:"..." }
       * OLD: { perception_output: "....json string...." } OR { perception_output: {...} }
       */
      let parsedPerception = null;

      // ✅ New contract
      if (perceptionData && perceptionData.ok === true && perceptionData.perception) {
        parsedPerception = perceptionData.perception;
      }

      // ✅ Old contract
      else if (perceptionData && perceptionData.perception_output != null) {
        const po = perceptionData.perception_output;

        if (typeof po === "object") {
          parsedPerception = po;
        } else if (typeof po === "string") {
          // Extract JSON block if model wrapped it
          const m = po.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsedPerception = JSON.parse(m[0]);
            } catch { }
          }
        }
      }

      // ❌ Explicit failure from new contract
      else if (perceptionData && perceptionData.ok === false) {
        throw new Error(
          `Perception returned ok=false. Raw:\n${(perceptionData.raw ?? perceptionText).slice(0, 800)}`
        );
      }

      // ❌ Unknown shape
      if (!parsedPerception || typeof parsedPerception !== "object") {
        throw new Error(
          `Perception returned unexpected shape:\n${JSON.stringify(perceptionData, null, 2).slice(0, 800)}`
        );
      }

      // Send OBJECT directly into /reasoning
      const perceptionForReasoning = parsedPerception;

      // Pretty markdown for UI
      const perceptionForUI = `
**Plane**: ${parsedPerception.plane ?? "?"}
**Region**: ${parsedPerception.region_guess ?? "?"}
**Structures**: ${Array.isArray(parsedPerception.visible_structures)
          ? parsedPerception.visible_structures.join(", ")
          : (parsedPerception.visible_structures ?? "None")
        }
**Target Visible**: ${parsedPerception.target_visible ? "YES" : "NO"}
**Findings**: ${parsedPerception.explanation ?? "None"}
**Confidence**: ${typeof parsedPerception.confidence === "number"
          ? parsedPerception.confidence.toFixed(2)
          : "?"
        }
`.trim();

      // --- PHASE 3: REASONING ---
      if (stopRef.current) return;
      // setSteps(prev => [...prev, { type: 'info', content: 'Deciding Next Move...' }]); // REMOVED per user request

      const last = currentSteps.length ? currentSteps[currentSteps.length - 1] : null;

      const reasoningResp = await fetch(`${BASE_URL}/reasoning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perception_output: perceptionForReasoning,
          text: currentPrompt,
          current_state: currentState,
          previous_action: last?.action ?? null,
          previous_thought: null, // Don't send full thought text (token heavy)
          previous_exec: last?.exec ?? null,
          previous_region: last?.region ?? null // Helpful for backend context
        })
      });

      if (!reasoningResp.ok) {
        const errorText = await reasoningResp.text();
        throw new Error(`Reasoning API failed: ${reasoningResp.status} ${errorText}`);
      }
      const result = await reasoningResp.json();


      // Construct combined thought for display
      // Only include window analysis if it was fresh
      let combinedThought = "";
      combinedThought = `**Visual Findings**: ${perceptionForUI}\n\n**Reasoning**: ${result.thought}`;

      const newStep = {
        content: combinedThought,
        action: result.action,
        timestamp: new Date().toISOString()
      };

      setSteps(prev => [...prev, { type: 'agent', ...newStep }]);
      let execReason = null;
      // Execute Action
      if (result.action) {
        console.log("Calling executeAction with:", result.action);
        const exec = await executeAction(result.action, viewport);
        console.log("executeAction returned:", exec);

        let execReason = null;
        if (exec === true) execReason = "ok";
        else if (exec?.reason) execReason = exec.reason; // hit_boundary
        else execReason = "failed";

        const stepWithExec = { ...newStep, exec };

        if (exec === true) {
          // --- LEARN DIRECTION ---
          const lastStep = currentSteps.length > 0 ? currentSteps[currentSteps.length - 1] : null;

          const prevRegion = lastStep?.region;
          const currentRegion = parsedPerception?.region_guess;

          if (prevRegion && currentRegion && prevRegion !== currentRegion && result.action?.step) {
            // Only learn if the action was a scroll
            const stepDelta = result.action.type === 'scroll_delta'
              ? result.action.step
              : (result.action.type === 'scroll_cranial' || result.action.type === 'scroll_caudal'
                ? (indexMapRef.current.cranialDeltaSign ?? -1) * (result.action.type === 'scroll_cranial' ? 1 : -1) * (result.action.step ?? 10)
                : 0);

            learnCranialSign(prevRegion, currentRegion, stepDelta);
          }

          await new Promise(r => setTimeout(r, 500));
          // Pass current region for next iteration learning
          const stepWithRegion = { ...stepWithExec, region: parsedPerception?.region_guess };
          return runAgentLoop(currentPrompt, iteration + 1, [...currentSteps, stepWithRegion]);
        }

        if (exec && exec.reason === "hit_boundary") {
          // AUTO-REVERSE ONE STEP to escape boundary (LLM stacks are often reversed)
          const reverseStep = exec.step ? -Math.sign(exec.step) * Math.min(3, Math.abs(exec.step)) : -3;

          const reverseAction = { type: "scroll_delta", step: reverseStep };
          const reverseExec = await executeAction(reverseAction, viewport);

          const boundaryStep = {
            ...stepWithExec,
            content:
              combinedThought +
              `\n\n**Note**: Hit boundary (atStart=${exec.atStart}, atEnd=${exec.atEnd}, step=${exec.step}). Auto-reversing with step=${reverseStep}.`,
            execReason: "hit_boundary",
            exec,
          };

          // If reverse worked, continue loop from the new slice
          if (reverseExec === true) {
            await new Promise(r => setTimeout(r, 300));
            return runAgentLoop(currentPrompt, iteration + 1, [...currentSteps, boundaryStep]);
          }

          // If reverse didn't work either, stop and show a useful error
          setSteps(prev => [...prev, { type: "error", content: "Stuck at both boundaries or viewport not moving." }]);
          setIsLooping(false);
          return;
        }


        setIsLooping(false);
        return;
      }
      // --- PHASE 4: FINAL PATIENT SUMMARY ---
      setSteps(prev => [...prev, { type: 'info', content: 'Target reached. Generating patient-friendly summary...' }]);

      const summaryText = await generatePatientSummary();

      if (summaryText) {
        // Auto-switch to chat
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `**Analysis Complete** for "${currentPrompt}":\n\n${summaryText}`
        }]);
        setActiveTab("chat");
        toast.success("Analysis complete! Switched to Chat.");
      }

      setIsLooping(false);
      return;

    } catch (error) {
      console.error("Agent Loop Error:", error);
      setSteps(prev => [...prev, { type: 'error', content: `Error: ${error.message}` }]);
      setIsLooping(false); // Use setIsLooping
      toast.error(`Agent error: ${error.message}`);
    }
  };

  const handleStart = async (overridePrompt) => {
    // If input is empty, maybe use previous prompt? But for now require input.
    const effectivePrompt = (typeof overridePrompt === 'string' ? overridePrompt : chatInput);

    if (!effectivePrompt?.trim()) {
      toast.error('Please enter a question or prompt for analysis');
      return;
    }

    const currentPrompt = effectivePrompt;
    setLoading(true);
    setResponse(null);
    setSteps([]);
    setIsLooping(true);

    // Add User Message for context is done in Chat, but for Pipeline we might not want to add it immediately?
    // Actually, distinct separation: Pipeline runs separately.
    // But we want to preserve context.

    // NOTE: We don't add to generic 'messages' yet. We wait for completion.

    stopRef.current = false;
    await runAgentLoop(currentPrompt);

    setLoading(false);
    setIsLooping(false);
  };

  const handleChatSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = { role: "user", content: chatInput };
    // Optimistic update
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send history but exclude the "agent logs" if we had them? 
        // For now just send standard messages. The backend might get confused if we send complex objects.
        // We need to filter simple messages only.
        body: JSON.stringify({
          messages: newHistory.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        })
      });

      if (!response.ok) throw new Error("Chat failed");

      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message");
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: "assistant", content: "Hello! I'm MedGemma (27B). Ask me any medical questions." }]);
    setSteps([]);
    setIsLooping(false);
  };

  const handleClear = () => {
    setPrompt('');
    setResponse(null);
    setSteps([]);
  };

  const generatePatientSummary = async () => {
    if (!renderingEngine) return null;
    const viewport = renderingEngine.getViewport('0-vp');

    // Capture 5 slices: current - 2 to current + 2
    const currentIdx = viewport.getCurrentImageIdIndex();
    const imageIds = viewport.getImageIds();
    const total = imageIds.length;

    const indices = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(d => currentIdx + d).filter(i => i >= 0 && i < total);

    setSteps(prev => [...prev, {
      type: 'info',
      content: `Generating multi-slice analysis for slices: ${indices.join(', ')}...`
    }]);

    try {
      // Capture detailed images
      const imagesBase64 = [];
      const originalIndex = currentIdx;

      for (const idx of indices) {
        viewport.setImageIdIndex(idx);
        viewport.render();
        await new Promise(r => setTimeout(r, 50)); // Allow render
        const b64 = await getImageAsBase64(viewport);
        if (b64) imagesBase64.push(b64);
      }

      // Restore original position
      viewport.setImageIdIndex(originalIndex);
      viewport.render();

      if (imagesBase64.length === 0) throw new Error("Failed to capture slice images");

      // Call new endpoint
      // Call new endpoint for Patient Summary
      const response = await fetch(`${BASE_URL}/summary-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images_base64: imagesBase64,
          text: prompt // context (using global prompt state or chatInput? Accessing closure)
          // We need the current prompt. State 'prompt' might be stale if we use 'chatInput'. 
          // Ideally we pass it in. For now, rely on chatInput as it's set in handleSelectFinding.
        })
      });

      const data = await response.json();
      // data is { summary: "..." }

      const summary = data.summary || "No summary generated.";

      setSteps(prev => [...prev, {
        type: 'summary',
        content: summary
      }]);

      return summary;

    } catch (e) {
      console.error(e);
      setSteps(prev => [...prev, { type: 'error', content: `Summary failed: ${e.message}` }]);
      return null;
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="fixed top-20 right-6 z-50 h-10 gap-2 shadow-2xl border border-white/10 transition-all hover:scale-105" variant="default">
          <Sparkles className="h-4 w-4" />
          MedGemma AI
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[450px] h-[750px] max-h-[82vh] flex flex-col p-0 shadow-2xl rounded-xl border-border overflow-hidden bg-background"
        align="end"
        sideOffset={8}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="p-3 border-b flex justify-between items-center flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-md text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <h4 className="font-semibold text-sm tracking-tight text-foreground">MedGemma Agent</h4>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted/50" onClick={() => setOpen(false)}>
            <span className="sr-only">Close</span>
            ✕
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-2 bg-muted/20">
            <TabsList className="w-full justify-start h-10 bg-transparent p-0 gap-6">
              <TabsTrigger
                value="pipeline"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-2 py-2 text-xs font-medium relative transition-all"
              >
                Impressions Assistant
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-2 py-2 text-xs font-medium transition-all"
              >
                Chat (27B)
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pipeline" className="flex-1 flex-col overflow-hidden data-[state=active]:flex mt-0">
            {pipelineMode === 'input' && (
              <div className="flex-1 flex flex-col p-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Radiology Report / Impressions</Label>
                  <p className="text-[11px] text-muted-foreground">Paste findings below. MedGemma will parse them for individual analysis.</p>
                </div>
                <Textarea
                  value={reportInput}
                  onChange={(e) => setReportInput(e.target.value)}
                  placeholder="1. 5mm nodule in RUL&#10;2. Trace pleural effusion..."
                  className="flex-1 resize-none font-mono text-xs leading-relaxed p-3 focus-visible:ring-1"
                />
                <Button onClick={handleParse} disabled={!reportInput.trim()} className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" /> Identify Findings
                </Button>
              </div>
            )}

            {pipelineMode === 'select' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-muted/5">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Finding</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPipelineMode('input')}>Back</Button>
                </div>
                <ScrollArea className="flex-1 px-4 py-2">
                  <div className="space-y-2 py-2">
                    {findings.map((f, i) => (
                      <div
                        key={i}
                        onClick={() => handleSelectFinding(f)}
                        className="group p-3 bg-card border shadow-sm rounded-lg hover:border-primary/50 hover:shadow-md cursor-pointer transition-all"
                      >
                        <div className="flex gap-3 items-start">
                          <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <span className="text-sm leading-snug group-hover:text-primary transition-colors">{f}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {pipelineMode === 'run' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-background">
                <div className="px-4 py-3 border-b flex justify-between items-center shadow-sm bg-muted/10">
                  <div className="flex flex-col overflow-hidden mr-3">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Analysing Finding</span>
                    <span className="text-xs font-semibold truncate" title={currentFinding}>{currentFinding}</span>
                  </div>
                  <Button variant="destructive" size="sm" className="h-7 text-xs px-3 shadow-sm" onClick={handleStop}>Stop</Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3 pb-8">
                    {steps.map((step, i) => {
                      const isLast = i === steps.length - 1;
                      let label = "Observation";
                      let colorClass = "text-blue-600 dark:text-blue-400";
                      let bgClass = "bg-blue-50 dark:bg-blue-950/20";
                      let borderClass = "border-blue-200 dark:border-blue-800";

                      if (step.type === 'summary') {
                        label = "Patient Summary";
                        colorClass = "text-green-600 dark:text-green-400";
                        bgClass = "bg-green-50 dark:bg-green-950/20";
                        borderClass = "border-green-200 dark:border-green-800";
                      } else if (step.type === 'info') {
                        label = "System";
                        colorClass = "text-muted-foreground";
                        bgClass = "bg-muted/30";
                        borderClass = "border-border";
                      } else if (step.type === 'error') {
                        label = "Error";
                        colorClass = "text-red-600 dark:text-red-400";
                        bgClass = "bg-red-50 dark:bg-red-950/20";
                        borderClass = "border-red-200 dark:border-red-800";
                      } else if (step.action) {
                        label = `Action: ${step.action.type.replace(/_/g, ' ')}`;
                        colorClass = "text-indigo-600 dark:text-indigo-400";
                        bgClass = "bg-indigo-50 dark:bg-indigo-950/20";
                        borderClass = "border-indigo-200 dark:border-indigo-800";
                      } else {
                        label = "Reasoning";
                        colorClass = "text-purple-600 dark:text-purple-400";
                        bgClass = "bg-purple-50 dark:bg-purple-950/20";
                        borderClass = "border-purple-200 dark:border-purple-800";
                      }

                      return (
                        <div key={i} className={`border rounded-lg overflow-hidden ${isLast ? 'shadow-md ring-1 ring-primary/10' : 'opacity-80'}`}>
                          <details open={isLast || step.type === 'summary'} className="group">
                            <summary className={`cursor-pointer px-3 py-2 ${bgClass} font-medium text-[10px] flex items-center justify-between gap-2 select-none group-open:border-b border-inherit`}>
                              <div className="flex items-center gap-2">
                                <span className="opacity-40 font-mono text-[9px]">#{i + 1}</span>
                                <span className={`font-bold uppercase tracking-tight ${colorClass}`}>{label}</span>
                              </div>
                              <div className="text-[10px] opacity-40 group-open:rotate-180 transition-transform">▼</div>
                            </summary>
                            <div className="p-3 text-xs leading-relaxed bg-card">
                              <div className="markdown-content text-foreground/90"><ReactMarkdown>{step.content}</ReactMarkdown></div>
                              {step.action && (
                                <div className="mt-2 pt-2 border-t font-mono text-[9px] text-muted-foreground bg-muted/20 p-2 rounded-md">
                                  {JSON.stringify(step.action, null, 2)}
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                    {loading && (
                      <div className="flex items-center justify-center py-6 bg-muted/5 rounded-xl border-2 border-dashed border-primary/20 animate-pulse transition-all mt-2">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Inspecting...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="chat" className="flex-1 flex-col overflow-hidden data-[state=active]:flex mt-0">
            <ScrollArea className="flex-1 bg-muted/5">
              <div className="p-4 space-y-4 pb-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-green-600 text-white'}`}>
                      {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-card border rounded-tl-sm'
                      }`}>
                      {msg.role === 'assistant' ? <div className="markdown-content"><ReactMarkdown>{msg.content}</ReactMarkdown></div> : msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm"><Bot className="h-4 w-4" /></div>
                    <div className="bg-card border shadow-sm p-3 rounded-2xl rounded-tl-sm text-sm text-muted-foreground animate-pulse flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-3 bg-background border-t">
              <form onSubmit={handleChatSubmit} className="flex gap-2 relative">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask MedGemma..."
                  className="flex-1 pr-10 shadow-sm"
                  disabled={loading || chatLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8"
                  variant="ghost"
                  disabled={loading || chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
                </Button>
              </form>
            </div>
          </TabsContent>

        </Tabs>
      </PopoverContent>
    </Popover >
  );
}
