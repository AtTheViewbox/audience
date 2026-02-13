import { useState, useContext, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Brain, Loader2, MousePointer2, Plus, Trash2, Check, X } from 'lucide-react';
import { DataContext } from '../context/DataContext';
import { segmentDicom, segmentDicomSeries, startSession, addPoint, addTextPrompt, stopSession, removeObject, propagateSession } from '@/utils/sam3_api_client';
import * as cornerstone from '@cornerstonejs/core';
import { toast } from 'sonner';

export default function SAM3SegmentButton() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [result, setResult] = useState(null);
  
  // Session state (Always On)
  const [sessionId, setSessionId] = useState(null);
  const [isRefining, setIsRefining] = useState(false);
  
  // Multi-object state
  const [objects, setObjects] = useState([{ id: 1, name: 'Object 1', color: '#00ff00' }]);
  const [currentObjId, setCurrentObjId] = useState(1);
  const [markers, setMarkers] = useState([]); 
  const [pendingChanges, setPendingChanges] = useState(false);
  
  // Refs for event listeners to access latest state
  const markersRef = useRef(markers);
  const objectsRef = useRef(objects);
  
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  
  const { renderingEngine } = useContext(DataContext).data;
  
  // Define available colors for objects
  const OBJECT_COLORS = [
    '#00ff00', '#00ffff', '#ff0000', '#ffff00', '#ff00ff', '#ffa500'
  ];

  // Helper to get color for object ID
  const getObjectColor = (objId) => {
    const obj = objectsRef.current.find(o => o.id === objId); // Use ref
    return obj ? obj.color : OBJECT_COLORS[(objId - 1) % OBJECT_COLORS.length];
  };

  const drawMaskOverlay = async (viewport, masks, boxes, objIds, imageIds, currentImageId) => {
    const element = viewport.element;
    if (!element) return;

    // Reset overlay data structure
    element.sam3SeriesData = {
      masks: masks, 
      boxes: boxes,
      objIds: objIds,
      imageIds: imageIds,
      isSeries: !!imageIds
    };

    const decodeMask = (base64Mask) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = `data:image/png;base64,${base64Mask}`;
      });
    };

    const renderMasks = async () => {
      // Clear existing overlays and markers
      const existingOverlays = element.querySelectorAll('.sam3-overlay');
      existingOverlays.forEach(overlay => overlay.remove());

      const canvas = element.querySelector('canvas');
      if (!canvas) return;

      // Create container
      const container = document.createElement('div');
      container.className = 'sam3-overlay';
      Object.assign(container.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1000'
      });
      element.appendChild(container);

      const imageData = viewport.getImageData();
      const { direction, spacing, origin } = imageData;

      const getCanvasCoord = (x, y) => {
        const world = [
          origin[0] + x * spacing[0] * direction[0] + y * spacing[1] * direction[3],
          origin[1] + x * spacing[0] * direction[1] + y * spacing[1] * direction[4],
          origin[2] + x * spacing[0] * direction[2] + y * spacing[1] * direction[5]
        ];
        return viewport.worldToCanvas(world);
      };

      // 1. Render Markers for Current Frame (Use REF for latest markers)
      const currentId = viewport.getCurrentImageId();
      let currentFrameIdx = 0;
      
      if (element.sam3SeriesData.isSeries && element.sam3SeriesData.imageIds) {
          currentFrameIdx = element.sam3SeriesData.imageIds.indexOf(currentId);
      }
      
      const currentMarkers = markersRef.current.filter(m => m.frameIdx === currentFrameIdx);
      
      currentMarkers.forEach(marker => {
          const [cx, cy] = getCanvasCoord(marker.x, marker.y);
          const markerEl = document.createElement('div');
          
          Object.assign(markerEl.style, {
              position: 'absolute',
              left: `${cx - 4}px`, 
              top: `${cy - 4}px`,
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: marker.label === 1 ? '#00ff00' : '#ff0000', 
              border: `2px solid ${marker.pending ? 'white' : 'black'}`,
              zIndex: '1002'
          });
          container.appendChild(markerEl);
      });

      // 2. Render Masks
      let maskIndex = -1;
      if (element.sam3SeriesData.isSeries) {
        maskIndex = element.sam3SeriesData.imageIds.indexOf(currentId);
      } else {
        maskIndex = element.sam3SeriesData.imageIds && element.sam3SeriesData.imageIds[0] === currentId ? 0 : -1;
      }

      if (maskIndex === -1) return;

      const maskEntry = element.sam3SeriesData.masks[maskIndex];
      const objIdEntry = element.sam3SeriesData.objIds ? element.sam3SeriesData.objIds[maskIndex] : [1];
      
      if (!maskEntry) return;

      const masksToRender = Array.isArray(maskEntry) ? maskEntry : [maskEntry];
      const objIdsToRender = Array.isArray(objIdEntry) ? objIdEntry : [1];

      if (masksToRender.length === 0) return;

      try {
        for (let idx = 0; idx < masksToRender.length; idx++) {
          const maskBase64 = masksToRender[idx];
          const objId = objIdsToRender[idx] || 1;
          const colorHex = getObjectColor(objId);
          
          // Convert hex to rgb
          const r = parseInt(colorHex.slice(1, 3), 16);
          const g = parseInt(colorHex.slice(3, 5), 16);
          const b = parseInt(colorHex.slice(5, 7), 16);
          
          if (!maskBase64) continue;

          const maskImg = await decodeMask(maskBase64);
          
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = canvas.width;
          maskCanvas.height = canvas.height;
          Object.assign(maskCanvas.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: (1000 + idx).toString()
          });
          container.appendChild(maskCanvas);
          
          const maskCtx = maskCanvas.getContext('2d');
          const imgW = maskImg.width;
          const imgH = maskImg.height;

          const topLeftCanvas = getCanvasCoord(0, 0);
          const topRightCanvas = getCanvasCoord(imgW, 0);
          const bottomLeftCanvas = getCanvasCoord(0, imgH);

          const canvasX = topLeftCanvas[0];
          const canvasY = topLeftCanvas[1];
          const canvasW = topRightCanvas[0] - topLeftCanvas[0]; 
          const canvasH = bottomLeftCanvas[1] - topLeftCanvas[1]; 

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = imgW;
          tempCanvas.height = imgH;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(maskImg, 0, 0);
          
          const imgData = tempCtx.getImageData(0, 0, imgW, imgH);
          const data = imgData.data;
          
          for (let i = 0; i < data.length; i += 4) {
             if (data[i] > 10) { 
               data[i] = r;
               data[i+1] = g;
               data[i+2] = b;
               data[i+3] = 120; // Alpha
             } else {
               data[i+3] = 0;
             }
          }
          tempCtx.putImageData(imgData, 0, 0);
          maskCtx.drawImage(tempCanvas, 0, 0, imgW, imgH, canvasX, canvasY, canvasW, canvasH);
        }
      } catch (e) {
        console.error('Error rendering masks:', e);
      }
    };
    
    renderMasks();

    const handleRender = () => {
      requestAnimationFrame(renderMasks); 
    };

    if (element.sam3RenderHandler) {
        element.removeEventListener('cornerstoneimagerendered', element.sam3RenderHandler);
        element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', element.sam3RenderHandler);
    }
    
    element.sam3RenderHandler = handleRender;
    element.addEventListener('cornerstoneimagerendered', handleRender);
    element.addEventListener('CORNERSTONE_IMAGE_RENDERED', handleRender);
  };

  // --- Click Handling for Refinement ---
  useEffect(() => {
    if (!renderingEngine || !sessionId || !isRefining) return;

    const viewport = renderingEngine.getViewport('0-vp');
    if (!viewport) return;
    const element = viewport.element;

    const handleMouseDown = (e) => {
      if (!isRefining) return;
      e.stopPropagation(); 
      e.preventDefault();

      const rect = element.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      const worldCoord = viewport.canvasToWorld([canvasX, canvasY]);
      const imageData = viewport.getImageData();
      const { direction, spacing, origin } = imageData;

      const diff = [
        worldCoord[0] - origin[0],
        worldCoord[1] - origin[1],
        worldCoord[2] - origin[2]
      ];

      const i = (diff[0] * direction[0] + diff[1] * direction[1] + diff[2] * direction[2]) / spacing[0];
      const j = (diff[0] * direction[3] + diff[1] * direction[4] + diff[2] * direction[5]) / spacing[1];

      const x = Math.round(i);
      const y = Math.round(j);

      // Label: Left (0) = Positive (1), Right (2) = Negative (0)
      const label = e.button === 0 ? 1 : 0;
      
      const currentId = viewport.getCurrentImageId();
      const imageIds = viewport.getImageIds();
      const frameIdx = imageIds.indexOf(currentId);
      
      if (frameIdx === -1) return;

      // Add to markers state (Pending)
      setMarkers(prev => [...prev, {
          x, y, label, frameIdx, objId: currentObjId, pending: true
      }]);
      setPendingChanges(true);
      
      // Trigger Re-render to show marker
      if (element.sam3RenderHandler) element.sam3RenderHandler();
    };

    const handleContextMenu = (e) => {
      if (isRefining) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation(); // Ensure we block other handlers
      }
    };

    // Use capture: true to intercept before other libraries
    element.addEventListener('mousedown', handleMouseDown, { capture: true });
    element.addEventListener('contextmenu', handleContextMenu, { capture: true });

    return () => {
      element.removeEventListener('mousedown', handleMouseDown, { capture: true });
      element.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    };
  }, [sessionId, isRefining, renderingEngine, currentObjId]);

  const handleSegment = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!renderingEngine) {
      toast.error('No DICOM loaded');
      return;
    }

    setLoading(true);
    setResult(null);
    setSessionId(null);
    setIsRefining(false);
    setMarkers([]);
    setObjects([{ id: 1, name: `Object 1`, color: OBJECT_COLORS[0] }]);
    setCurrentObjId(1);

    try {
      const viewport = renderingEngine.getViewport('0-vp');
      const currentImageId = viewport.getCurrentImageId();
      let dicomUrl = currentImageId.replace('wadouri:', '').replace('dicomweb:', '');
      
      const imageIds = viewport.getImageIds(); // Always get stack
      const currentFrameIdx = imageIds.indexOf(currentImageId); 
      const dicomUrls = imageIds.map(id => id.replace('wadouri:', '').replace('dicomweb:', ''));

      // --- ALWAYS INTERACTIVE SERIES SESSION ---
        
        // 1. Start Session
        console.log('Starting interactive session...');
        const sessionInfo = await startSession(dicomUrls);
        const newSessionId = sessionInfo.session_id;
        setSessionId(newSessionId);
        
        // 2. Initial text prompt
        console.log(`Segmenting series with prompt "${prompt}" at frame ${currentFrameIdx}`);
        // IMPORTANT: propagate=false for initial segment
        const result = await addTextPrompt(newSessionId, currentFrameIdx, prompt, false);
        
        setResult({
                  numMasks: result.num_frames, 
                  type: 'series',
                  masks: result.masks_per_frame,
                  boxes: result.boxes_per_frame,
                  objIds: result.obj_ids_per_frame
        });
        
        updateObjectsFromResponse(result.obj_ids_per_frame);
        
        // Render overlay
        await drawMaskOverlay(viewport, result.masks_per_frame, result.boxes_per_frame, result.obj_ids_per_frame, imageIds, currentImageId);
        toast.success(`Segmented Frame ${currentFrameIdx} (Click Propagate to update video)`);

    } catch (error) {
      console.error('Segmentation error:', error);
      toast.error(`Segmentation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const updateObjectsFromResponse = (objIdsPerFrame) => {
      // Collect all unique IDs
      const uniqueIds = new Set();
      if (objIdsPerFrame) {
          objIdsPerFrame.forEach(ids => ids && ids.forEach(id => uniqueIds.add(id)));
      }
      
      setObjects(prev => {
          const next = [...prev];
          uniqueIds.forEach(id => {
              if (!next.find(o => o.id === id)) {
                  next.push({
                      id, 
                      name: `Object ${id}`, 
                      color: OBJECT_COLORS[(id - 1) % OBJECT_COLORS.length]
                  });
              }
          });
          return next;
      });
  };
  
  const handleApplyChanges = async () => {
      if (!pendingChanges || markersRef.current.length === 0) return;
      
      setLoading(true);
      try {
          // Group pending markers by frame and object
          const pendingMarkers = markersRef.current.filter(m => m.pending);
          const updates = {}; // Key: "frameIdx_objId" -> points/labels
          
          pendingMarkers.forEach(m => {
              const key = `${m.frameIdx}_${m.objId}`;
              if (!updates[key]) updates[key] = { points: [], labels: [] };
              updates[key].points.push([m.x, m.y]);
              updates[key].labels.push(m.label);
          });
          
          let lastResult = null;
          
          // Send requests sequentially, WITHOUT PROPAGATION (update current frame only)
          const newResultState = { 
              ...result,
              masks: [...(result.masks || [])],
              boxes: [...(result.boxes || [])],
              objIds: [...(result.objIds || [])]
          }; 
          
          for (const key of Object.keys(updates)) {
              const [frameIdx, objId] = key.split('_').map(Number);
              const data = updates[key];
              
              console.log(`Applying to Frame ${frameIdx}, Obj ${objId}, propagate=false`);
              
              const singleFrameResult = await addPoint(sessionId, frameIdx, data.points, data.labels, objId, false);
              console.log('Single Frame Result:', singleFrameResult);
              
              if (singleFrameResult) {
                 // MERGE logic: only update the frame that changed
                 if (singleFrameResult.masks_per_frame && singleFrameResult.masks_per_frame[frameIdx]) {
                     const oldMask = newResultState.masks[frameIdx];
                     const newMask = singleFrameResult.masks_per_frame[frameIdx];
                     if (JSON.stringify(oldMask) === JSON.stringify(newMask)) {
                         console.warn(`Mask for Frame ${frameIdx} is IDENTICAL!`);
                     } else {
                         console.log(`Mask for Frame ${frameIdx} CHANGED. Length:`, newMask.length);
                     }
                     newResultState.masks[frameIdx] = newMask;
                     console.log(`Merged Mask for Frame ${frameIdx}:`, newResultState.masks[frameIdx]);
                 }
                 if (singleFrameResult.boxes_per_frame && singleFrameResult.boxes_per_frame[frameIdx]) {
                     newResultState.boxes[frameIdx] = singleFrameResult.boxes_per_frame[frameIdx];
                 }
                 if (singleFrameResult.obj_ids_per_frame && singleFrameResult.obj_ids_per_frame[frameIdx]) {
                     newResultState.objIds[frameIdx] = singleFrameResult.obj_ids_per_frame[frameIdx];
                 }
              }
          }
          
          // Update state with merged results
          setResult(newResultState);
          updateObjectsFromResponse(newResultState.objIds);
          
          // Redraw (using merged state)
          const viewport = renderingEngine.getViewport('0-vp');
          const imageIds = viewport.getImageIds();
          const currentId = viewport.getCurrentImageId();
          await drawMaskOverlay(viewport, newResultState.masks, newResultState.boxes, newResultState.objIds, imageIds, currentId);
          
          toast.success('Applied to frame!');
          
          // updates success: mark all markers as non-pending
          setMarkers(prev => prev.map(m => ({ ...m, pending: false })));
          setPendingChanges(false);
          
      } catch (err) {
          console.error(err);
          toast.error('Failed to apply changes');
      } finally {
          setLoading(false);
      }
  };
  
  const handlePropagate = async () => {
      if (!sessionId) return;
      
      setPropagating(true);
      try {
          console.log('Propagating session...');
          const result = await propagateSession(sessionId);
          
          setResult({
              ...result,
              masks: result.masks_per_frame,
              boxes: result.boxes_per_frame,
              objIds: result.obj_ids_per_frame,
              type: 'series'
          });
          
          // Redraw overlay for current frame (it might have changed)
          const viewport = renderingEngine.getViewport('0-vp');
          const imageIds = viewport.getImageIds();
          const currentId = viewport.getCurrentImageId();
          await drawMaskOverlay(viewport, result.masks_per_frame, result.boxes_per_frame, result.obj_ids_per_frame, imageIds, currentId);
          
          toast.success('Propagated to all frames!');
          
      } catch (err) {
          console.error(err);
          toast.error('Propagation failed');
      } finally {
          setPropagating(false);
      }
  };

  const handleAddObject = () => {
      const newId = Math.max(...objectsRef.current.map(o => o.id), 0) + 1;
      setObjects(prev => [...prev, {
          id: newId,
          name: `Object ${newId}`,
          color: OBJECT_COLORS[(newId - 1) % OBJECT_COLORS.length]
      }]);
      setCurrentObjId(newId);
      toast.success(`Added new object: ${newId}`);
  };
  
  const handleRemoveObject = async (objId) => {
      if (!confirm(`Delete Object ${objId}?`)) return;
      
      setLoading(true);
      try {
          // Remove without implicit propagation (user must click Propagate)
          const result = await removeObject(sessionId, objId, false);
          
          // Update state
          setObjects(prev => prev.filter(o => o.id !== objId));
          if (currentObjId === objId) setCurrentObjId(objectsRef.current[0]?.id || 1);
          
          // Remove markers for this object
          setMarkers(prev => prev.filter(m => m.objId !== objId));
          
          // Update result
          setResult(prev => ({
              ...prev,
              masks: result.masks_per_frame,
              objIds: result.obj_ids_per_frame
          }));
          
          const viewport = renderingEngine.getViewport('0-vp');
          await drawMaskOverlay(viewport, result.masks_per_frame, result.boxes_per_frame, result.obj_ids_per_frame, viewport.getImageIds(), viewport.getCurrentImageId());
          
          toast.success(`Removed Object ${objId} (Click Propagate to update video)`);
      } catch (err) {
          console.error(err);
          toast.error('Failed to remove object');
      } finally {
          setLoading(false);
      }
  };

  const handleStopSession = async () => {
      if (sessionId) {
          await stopSession(sessionId);
          setSessionId(null);
          setIsRefining(false);
          setResult(null);
          setMarkers([]);
          toast.success("Session closed");
          
          // Clear overlay
          const viewport = renderingEngine.getViewport('0-vp');
          if (viewport?.element) {
              viewport.element.querySelectorAll('.sam3-overlay').forEach(el => el.remove());
          }
      }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="fixed top-4 right-4 z-50 gap-2" variant="default">
          <Brain className="h-4 w-4" />
          SAM3 Segment
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80"> {/* Reduced from w-96 */}
        <ScrollArea className="h-auto max-h-[60vh] pr-4"> {/* Dynamic height up to 60vh */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Interactive Segmentation</h4>
            <p className="text-sm text-muted-foreground">
              Multi-object tracking with point refinement
            </p>
          </div>
          
          {!sessionId ? (
              <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Prompt</Label>
                    <Input
                      placeholder="e.g., liver..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  {/* Toggle Removed - Always Series Mode */}
                  <div className="text-xs text-muted-foreground mb-2">
                    Auto-propagation enabled.
                  </div>
                  <Button onClick={handleSegment} disabled={loading || !prompt.trim()} className="w-full">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Start Segmentation
                  </Button>
              </div>
          ) : (
              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                       <h5 className="font-medium">Active Session</h5>
                       <Badge variant={isRefining ? "default" : "outline"}>
                           {isRefining ? "Refine Mode" : "View Mode"}
                       </Badge>
                  </div>
                  
                  {/* Object List */}
                  <div className="border rounded-md p-2 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold">Objects</span>
                          <Button size="xs" variant="ghost" onClick={handleAddObject}>
                              <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                      </div>
                      <div className="space-y-1">
                          {objects.map(obj => (
                              <div 
                                key={obj.id}
                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer border ${currentObjId === obj.id ? 'bg-accent border-primary' : 'hover:bg-muted border-transparent'}`}
                                onClick={() => setCurrentObjId(obj.id)}
                              >
                                  <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full" style={{ background: obj.color }} />
                                      <span className="text-sm">{obj.name}</span>
                                  </div>
                                  {objects.length > 1 && (
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleRemoveObject(obj.id); }}>
                                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                      </Button>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2">
                      <Button 
                          variant={isRefining ? "secondary" : "outline"}
                          onClick={() => setIsRefining(!isRefining)}
                      >
                          <MousePointer2 className="mr-2 h-4 w-4" />
                          {isRefining ? 'Exit Refine' : 'Refine'}
                      </Button>
                      
                       <Button 
                          variant={pendingChanges ? "default" : "outline"}
                          onClick={handleApplyChanges}
                          disabled={!pendingChanges || loading}
                      >
                           {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                           Apply Frame
                      </Button>
                  </div>
                  
                  {/* Propagate Button - Manual */}
                  <Button 
                      variant="secondary" 
                      className="w-full mt-2" 
                      onClick={handlePropagate}
                      disabled={propagating || loading}
                  >
                      {propagating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                      Propagate to Video
                  </Button>
                  
                  <Button variant="destructive" onClick={handleStopSession} className="w-full mt-2">
                      Stop Session
                  </Button>

                  {isRefining && (
                       <div className="bg-muted p-2 rounded-md text-xs text-muted-foreground">
                          <p><strong>Left Click:</strong> Add Positive (Green)</p>
                          <p><strong>Right Click:</strong> Add Negative (Red)</p>
                          <p>Clicks update the current frame. Click "Propagate" to update video.</p>
                       </div>
                  )}
              </div>
          )}
        </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
