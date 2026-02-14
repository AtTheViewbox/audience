import { useState, useContext } from 'react';
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
import { Sparkles, Loader2, Eye } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

export default function MedGemmaButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const { renderingEngine } = useContext(DataContext).data;

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

  /* Agent State */
  const [steps, setSteps] = useState([]); // [{ type: 'thought'|'action', content: string }]
  const [isLooping, setIsLooping] = useState(false);

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

        console.log("Setting VOI (HU -> SV):", {
          wwHU, wcHU,
          slope, intercept,
          wwSV, wcSV,
          fromCache: !!image
        });

        if (wwSV !== undefined && wcSV !== undefined) {
          // Use low/high range format which is robust in Cornerstone
          viewport.setProperties({
            voiRange: cornerstone.utilities.windowLevel.toLowHighRange(wwSV, wcSV)
          });
          
          // Force render
          viewport.render();
          
          return true;
        }
      } 
      else if (action.type === 'scroll_to_slice') {
        const { index } = action;
        if (index !== undefined) {
          // Check bounds
          const imageIds = viewport.getImageIds();
          // Clamp index
          const safeIndex = Math.max(0, Math.min(index, imageIds.length - 1));
          
          if (viewport.getCurrentImageIdIndex() === safeIndex) {
              return false; // No change
          }
          
          viewport.setImageIdIndex(safeIndex);
          viewport.render();
          return true;
        }
      }
      else if (action.type === 'scroll_delta') {
          const { step } = action;
          if (step !== undefined) {
              const currentIndex = viewport.getCurrentImageIdIndex();
              const imageIds = viewport.getImageIds();
              const newIndex = currentIndex + step;
              const safeIndex = Math.max(0, Math.min(newIndex, imageIds.length - 1));
              
              if (currentIndex === safeIndex) return false;
              
              viewport.setImageIdIndex(safeIndex);
              viewport.render();
              
              // Sync context to prevent reset on re-render
              // We need to extract the Instance Number from the Image ID to update 'ci'
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
          }
      }
    } catch (error) {
      console.error("Failed to execute action:", error);
    }
    return false;
  };

  const runAgentLoop = async (currentPrompt, iteration = 0, currentSteps = []) => {
    // Check if we hit max steps
    // If so, we do ONE FINAL call with skip_actions=true to force a summary
    const isMaxStep = iteration >= MAX_STEPS;
    
    if (isMaxStep) {
         setSteps(prev => [...prev, { type: 'info', content: 'Max reasoning steps reached. Generating summary...' }]);
         // Proceed, but with skipActions flag set below
    }

    try {
      if (!renderingEngine) throw new Error('No image loaded');
      const viewport = renderingEngine.getViewport('0-vp');
      if (!viewport) throw new Error('Viewport not found');

      // Add a small delay to ensure any previous rendering/state changes are settled
      await new Promise(r => setTimeout(r, 100));

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
      
      // --- PHASE 1: PRE-CHECKS (Windowing - ONLY ON FIRST STEP) ---
      let windowAnalysis = "Not checked (persisted)";
      if (iteration === 0) {
          // Only check window on first step
          const windowResp = await fetch(`https://mfei1225--medgemma-dual-agent-v11-check-window-endpoint.modal.run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: currentPrompt
            })
          });
          const windowData = await windowResp.json();
          const win = windowData.window_analysis;
          windowAnalysis = `Suggested: ${win.name} (W: ${win.window}, L: ${win.level})`;
      } else {
          // Retrieve previous window analysis if available, or just skip
          // For simplicity we just say it was done previously
          windowAnalysis = "Previously checked";
      }
      
      // --- PHASE 2: PERCEPTION ---
      // setSteps(prev => [...prev, { type: 'info', content: 'Analyzing Image Structures...' }]); // REMOVED per user request
      
      const perceptionResp = await fetch(`https://mfei1225--medgemma-dual-agent-v11-perception-endpoint.modal.run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_base64: imageBase64,
            text: currentPrompt
        })
      });
      const perceptionData = await perceptionResp.json();
      const perceptionOutput = perceptionData.perception_output;
      
      // --- PHASE 3: REASONING ---
      // setSteps(prev => [...prev, { type: 'info', content: 'Deciding Next Move...' }]); // REMOVED per user request

      const reasoningResp = await fetch(`https://mfei1225--medgemma-dual-agent-v11-reasoning-endpoint.modal.run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            perception_output: perceptionOutput,
            window_analysis: windowAnalysis,
            text: currentPrompt,
            current_state: currentState,
            previous_action: currentSteps.length > 0 ? currentSteps[currentSteps.length - 1].action : "None",
            previous_thought: currentSteps.length > 0 ? currentSteps[currentSteps.length - 1].thought : "None"
        })
      });
      
      const result = await reasoningResp.json();
      
      // Construct combined thought for display
      // Only include window analysis if it was fresh
      let combinedThought = "";
      if (iteration === 0) {
           combinedThought += `**Window Analysis**: ${windowAnalysis}\n\n`;
      }
      combinedThought += `**Visual Findings**: ${perceptionOutput}\n\n**Reasoning**: ${result.thought}`;
      
      const newStep = {
        thought: combinedThought,
        action: result.action,
        timestamp: new Date().toISOString()
      };
      
      setSteps(prev => [...prev, { type: 'agent', ...newStep }]);

      // Execute Action
      if (result.action) {
        const success = await executeAction(result.action, viewport); // Pass viewport
        if (success) {
            // Recurse
            await new Promise(r => setTimeout(r, 500)); // Add delay before recursion
            await runAgentLoop(currentPrompt, iteration + 1, [...currentSteps, newStep]);
        } else {
             // setSteps(prev => [...prev, { type: 'info', content: 'Action failed or no change needed. Stopping.' }]); // REMOVED
             setIsLooping(false); // Use setIsLooping
        }
      } else {
        setSteps(prev => [...prev, { type: 'success', content: 'Target reached or task complete.' }]);
        setIsLooping(false); // Use setIsLooping
      }
      
    } catch (error) {
      console.error("Agent Loop Error:", error);
      setSteps(prev => [...prev, { type: 'error', content: `Error: ${error.message}` }]);
      setIsLooping(false); // Use setIsLooping
      toast.error(`Agent error: ${error.message}`);
    }
  };

  const handleStart = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a question or prompt');
      return;
    }

    setLoading(true);
    setResponse(null);
    setSteps([]);
    setIsLooping(true);
    
    await runAgentLoop(prompt);
    
    setLoading(false);
    setIsLooping(false);
  };

  const handleClear = () => {
    setPrompt('');
    setResponse(null);
    setSteps([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="fixed top-16 right-4 z-50 gap-2 shadow-lg" variant="secondary">
          <Sparkles className="h-4 w-4" />
          MedGemma AI
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[450px] h-[calc(100vh-120px)] flex flex-col p-0 mr-4 mt-2 shadow-2xl border-2 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()} // Keep open even out of focus
      >
        <div className="p-4 border-b bg-muted/30 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <h4 className="font-bold text-lg">Medical AI Agent</h4>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6 pb-12">
            <div className="space-y-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-[10px] text-blue-800 dark:text-blue-200 leading-tight">
                <p className="font-bold flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3" /> HOW IT WORKS
                </p>
                The agent captures the current view, <strong>thinks</strong> about the anatomical goal, and takes an <strong>action</strong> (scrolling or windowing). It repeats this loop until the target is perfectly visualized.
              </div>
            </div>
            

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-blue-600 dark:text-blue-400">YOUR REQUEST</Label>
              <Textarea
                placeholder="Paste a radiology report impression here..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                rows={3}
                className="resize-none border-blue-100 dark:border-blue-900 focus-visible:ring-blue-500 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleStart} 
                disabled={loading || !prompt.trim()} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Agent Stepping (Iter {steps.length + 1})...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze Case
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleClear}
                disabled={loading}
              >
                Clear
              </Button>
            </div>

            {/* Transparent Reasoning UI */}
            {steps.length > 0 && (
                <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        <Eye className="h-3 w-3" /> Agent Chain of Thought
                    </Label>
                    <div className="space-y-2">
                        {steps.map((step, i) => {
                            const isLast = i === steps.length - 1;
                            const isObservation = !step.action;
                            
                            // OBSERVATION / FINAL ASSESSMENT
                            if (isObservation) {
                                return (
                                    <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                        <div className="bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800 rounded-lg p-5 mt-2 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                                <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-tighter">
                                                  {isLast && !loading ? "Final Assessment" : "Initial Impression"}
                                                </span>
                                            </div>
                                            <div className="text-base leading-relaxed font-medium text-foreground markdown-content">
                                                <ReactMarkdown>{step.content}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // AGENTIC STEP (Thought + Action)
                            return (
                                <div key={i} className="border rounded-md overflow-hidden bg-muted/20">
                                    <details open={isLast} className="group">
                                        <summary className="cursor-pointer p-2 bg-muted/40 hover:bg-muted font-medium text-[10px] flex items-center justify-between gap-2 select-none group-open:border-b">
                                            <div className="flex items-center gap-2">
                                                <span className="opacity-50 font-bold">Step {i+1}:</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tight">
                                                    Action: {step.action.type.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <div className="text-[10px] opacity-40 group- Larson open:rotate-180 transition-transform">▼</div>
                                        </summary>
                                        <div className="p-3 bg-background/30 text-xs text-muted-foreground leading-snug markdown-content border-l-2 border-blue-500/30 ml-1 mt-1">
                                            <p className="text-[10px] font-bold text-blue-500/70 mb-1 uppercase">Reasoning</p>
                                            <ReactMarkdown>{step.content}</ReactMarkdown>
                                            <div className="mt-2 pt-2 border-t font-mono text-[9px] opacity-60 bg-muted/50 p-1 rounded">
                                                {JSON.stringify(step.action, null, 2)}
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            );
                        })}
                        
                        {loading && (
                             <div className="flex items-center justify-center py-6 bg-muted/10 rounded-md border-dashed border-2 animate-pulse transition-all">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Step {steps.length + 1}: Inspecting medical volume...
                                </p>
                             </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-2 text-[9px] text-yellow-800 dark:text-yellow-200 opacity-60">
              <p><strong>⚠️ Disclaimer:</strong> This AI is for research and educational purposes only. Not a substitute for professional medical advice.</p>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
