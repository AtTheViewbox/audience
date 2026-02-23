import React, { useRef, useContext, useEffect, useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Circle } from "lucide-react"
import { ImageLoaderQueue } from '../lib/ImageLoaderQueue.ts';
import { toast } from "sonner";


export default function Viewport(props) {
  const searchParams = new URLSearchParams(location.search);
  const elementRef = useRef(null);

  const { vd, toolSelected, coordData, sharingUser } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const { viewport_idx, rendering_engine } = props;
  const [viewportReady, setViewportReady] = useState(false);
  const viewport_data = vd[viewport_idx];
  const pointerRef = useRef(null);

  // State for sparse stack management
  const [sortedLoadedIndices, setSortedLoadedIndices] = useState([0]);
  const queueRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const voiRef = useRef(null);
  const invertRef = useRef(false);
  const voiCorrectionActiveRef = useRef(false);
  const prevImageIndexRef = useRef(0);
  const loadedSetRef = useRef(new Set());
  const progressThrottleRef = useRef(null);

  const { dispatch } = useContext(DataDispatchContext);

  // New state from remote for Progress Bar
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [allImagesLoaded, setAllImagesLoaded] = useState(false);

  useEffect(() => {
    // Imperative update for cursor position to avoid re-renders
    if (viewport_data && viewportReady && pointerRef.current) {
      // Logic to determine visibility
      const shouldShow = coordData &&
        coordData.viewport == `${viewport_idx}-vp` &&
        sharingUser &&
        userData &&
        userData.id != sharingUser;

      if (shouldShow && coordData?.coord) {
        const viewportId = `${viewport_idx}-vp`;
        const viewport = rendering_engine.getViewport(viewportId);

        if (viewport) {
          const canvasCoord = viewport.worldToCanvas([coordData.coord[0], coordData.coord[1], coordData.coord[2]]);

          // Use transform for performant updates
          // existing transform was translate(-8px, -2px)
          pointerRef.current.style.transform = `translate(${canvasCoord[0] - 8}px, ${canvasCoord[1] - 2}px)`;
          pointerRef.current.style.display = 'block';
          return;
        }
      }

      // Hide if conditions not met
      pointerRef.current.style.display = 'none';

    }
  }, [coordData, viewportReady, viewport_data, rendering_engine, viewport_idx, sharingUser, userData]);

  useEffect(() => {
    if (!viewportReady) return;

    const {
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      ZoomTool,
      ProbeTool,
      ToolGroupManager,
      Enums: csToolsEnums,
    } = cornerstoneTools;

    const { MouseBindings } = csToolsEnums;
    const toolGroupId = `${viewport_idx}-tl`;

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    // Safety check if toolGroup somehow doesn't exist yet
    if (!toolGroup) return;

    switch (toolSelected) {
      case "pan":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolPassive(ProbeTool.toolName);
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "zoom":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolPassive(ProbeTool.toolName);
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "window":
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolPassive(ProbeTool.toolName);
        toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "scroll":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(ProbeTool.toolName);
        toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "pointer":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolActive(ProbeTool.toolName);
        break;
    }

  }, [toolSelected, viewportReady, viewport_idx]);

  const addCornerstoneTools = () => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    const {
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      ZoomTool,
      ProbeTool,
      ToolGroupManager,
      Enums: csToolsEnums,
    } = cornerstoneTools;

    const { MouseBindings } = csToolsEnums;
    const toolGroupId = `${viewport_idx}-tl`;

    // Only create if it doesn't exist
    let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) {
      ToolGroupManager.createToolGroup(toolGroupId);
      toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      toolGroup.addTool(WindowLevelTool.toolName);
      toolGroup.addTool(PanTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);
      toolGroup.addTool(StackScrollTool.toolName, { loop: false });
      toolGroup.addTool(ProbeTool.toolName);

      if (mobile) {
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
        toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ numTouchPoints: 3 }], });
      } else {
        // StackScrollMouseWheelTool intentionally NOT added — we handle
        // wheel events ourselves to gate scrolling to cached-only images
        // and prevent Cornerstone's on-demand loader from triggering.
        toolGroup.setToolActive(WindowLevelTool.toolName);
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }], });
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }], });
        toolGroup.setToolActive(StackScrollTool.toolName);
      }
    }

    // Always ensure the viewport is added to the toolGroup (handle re-mounts/Strict Mode)
    // This fixes the issue where tools are not attached if the group already exists
    toolGroup.addViewport(`${viewport_idx}-vp`, 'myRenderingEngine');
  };


  const loadImagesAndDisplay = async () => {
    const viewportId = `${viewport_idx}-vp`;
    const viewportInput = {
      viewportId,
      type: cornerstone.Enums.ViewportType.STACK,
      element: elementRef.current,
      defaultOptions: {},
    };


    rendering_engine.enableElement(viewportInput);
    dispatch({ type: 'viewport_ready', payload: { viewportId: viewport_idx } });

    const viewport = rendering_engine.getViewport(viewportId);
    const { s, ww, wc } = viewport_data;

    let initialIndex = 0;
    // Match absolute instance number from URL
    if (viewport_data.ci !== undefined && s.length > 0) {
      const targetNumber = parseInt(viewport_data.ci, 10);
      if (!isNaN(targetNumber)) {
        const getNumber = (str) => {
          const match = str.match(/(\d+)(?!.*\d)/); // Last sequence of digits
          return match ? parseInt(match[0], 10) : null;
        };

        // Look for the image that has this specific number
        const foundIndex = s.findIndex(url => getNumber(url) === targetNumber);

        if (foundIndex !== -1) {
          initialIndex = foundIndex;
        }
      }
    }

    loadedSetRef.current = new Set([initialIndex]);
    prevImageIndexRef.current = initialIndex;
    setLoadedImages(new Set([initialIndex]));
    setAllImagesLoaded(false);

    try {
      await cornerstone.imageLoader.loadAndCacheImage(s[initialIndex], { priority: 100 });
      setLoadedImages(new Set([initialIndex]));

      // Initial Stack: Use ALL image IDs to allow navigation/scrolling immediately
      // Cornerstone handles lazy-loading pixels as needed.
      await viewport.setStack(s, initialIndex);

      voiRef.current = cornerstone.utilities.windowLevel.toLowHighRange(ww, wc);
      viewport.setProperties({
        voiRange: voiRef.current,
        isComputedVOI: false,
      });
      invertRef.current = viewport.getProperties().invert ?? false;

      addCornerstoneTools();
      setViewportReady(true);
      setSortedLoadedIndices([initialIndex]);

      // Start the intelligent queue
      startQueue(s, viewportId, initialIndex);

      // Intercept wheel events in the CAPTURE phase — this runs before
      // Cornerstone's StackScrollMouseWheelTool (which listens in the
      // bubble phase). We stop propagation so Cornerstone never sees
      // the event, then navigate ourselves only to cached images.
      const handleWheel = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        // When externally synced (Compare-with-Normal), block all user scrolling
        if (el?.dataset.voiSynced) return;

        const delta = event.deltaY > 0 ? 1 : -1;
        const currentId = viewport.getCurrentImageId();
        const current = s.indexOf(currentId);

        for (let i = current + delta; i >= 0 && i < s.length; i += delta) {
          if (loadedSetRef.current.has(i)) {
            viewport.setImageIdIndex(i);

            if (voiRef.current) {
              viewport.setProperties({
                voiRange: voiRef.current,
                invert: invertRef.current,
                isComputedVOI: false,
              });
              viewport.render();
            }

            prevImageIndexRef.current = i;
            setCurrentImageIndex(i);
            if (queueRef.current) {
              queueRef.current.updateFocus(i);
            }
            break;
          }
        }
      };

      // Fallback for non-wheel navigation (touch drag, programmatic).
      // Still gates to loaded images, but the wheel handler above is
      // the primary defense for desktop scrolling.
      const handleImageChange = (event) => {
        const imageId = viewport.getCurrentImageId();
        const targetIndex = s.indexOf(imageId);

        if (queueRef.current) {
          queueRef.current.updateFocus(targetIndex);
        }

        if (!loadedSetRef.current.has(targetIndex)) {
          const prev = prevImageIndexRef.current;
          const dir = targetIndex >= prev ? 1 : -1;

          let nearest = -1;
          for (let i = prev + dir; i >= 0 && i < s.length; i += dir) {
            if (loadedSetRef.current.has(i)) {
              nearest = i;
              break;
            }
          }

          if (nearest === -1) nearest = prev;

          if (nearest !== targetIndex) {
            viewport.setImageIdIndex(nearest);
            prevImageIndexRef.current = nearest;
            setCurrentImageIndex(nearest);
            return;
          }
        }

        prevImageIndexRef.current = targetIndex;
        setCurrentImageIndex(targetIndex);
      };

      const captureUserVoi = () => {
        const props = viewport.getProperties();
        if (props.voiRange) {
          voiRef.current = props.voiRange;
          invertRef.current = props.invert ?? false;
        }
      };

      const el = elementRef.current;
      el?.addEventListener('wheel', handleWheel, { capture: true, passive: false });
      el?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);
      el?.addEventListener('mouseup', captureUserVoi);
      el?.addEventListener('touchend', captureUserVoi);

      return () => {
        el?.removeEventListener('wheel', handleWheel, true);
        el?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);
        el?.removeEventListener('mouseup', captureUserVoi);
        el?.removeEventListener('touchend', captureUserVoi);

        if (progressThrottleRef.current) {
          clearTimeout(progressThrottleRef.current);
          progressThrottleRef.current = null;
        }

        if (queueRef.current) {
          queueRef.current.destroy();
        }
      };
    } catch (e) {
      console.error("Error loading first image", e);
    }
  };

  const startQueue = (allImageIds, viewportId, initialIndex = 0) => {
    // Detect device type
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);



    const queue = new ImageLoaderQueue(
      allImageIds,
      3,
      (loadedIndex) => {
        loadedSetRef.current.add(loadedIndex);

        if (loadedSetRef.current.size === allImageIds.length) {
          setAllImagesLoaded(true);
          setLoadedImages(new Set(loadedSetRef.current));
          if (progressThrottleRef.current) {
            clearTimeout(progressThrottleRef.current);
            progressThrottleRef.current = null;
          }
        } else if (!progressThrottleRef.current) {
          progressThrottleRef.current = setTimeout(() => {
            setLoadedImages(new Set(loadedSetRef.current));
            progressThrottleRef.current = null;
          }, 250);
        }
      },
      () => { },
      isMobile
    );

    queueRef.current = queue;
    queue.markAsLoaded(initialIndex); // Mark initial image as already loaded



    queue.updateFocus(initialIndex);
    queue.start();
  };

  // Effect: Sync state changes if needed (e.g. metadata updates)
  useEffect(() => {
    if (rendering_engine && viewportReady && viewport_data) {
      // We no longer need to update the stack manually when images load
      // because we use a dense stack from the start. 
      // This allows the AI and user to scroll to any index instantly.
    }
  }, [viewportReady, rendering_engine]);

  // Double-tap detection for pointer tool selection (only when sharing is active)
  useEffect(() => {
    if (!elementRef.current || !viewportReady || !sharingUser) return;

    const DOUBLE_TAP_DELAY = 300; // milliseconds
    let lastToastTime = 0;

    const handleDoubleTap = (event) => {
      const currentTime = new Date().getTime();
      const tapInterval = currentTime - lastTapTimeRef.current;
      const isMultiTouch = event.type === 'touchstart' && event.touches.length > 1;

      if (tapInterval < DOUBLE_TAP_DELAY && tapInterval > 0 && !isMultiTouch && sharingUser === userData?.id) {
        // Double-tap detected - toggle between pointer and scroll
        const newTool = toolSelected === 'pointer' ? 'scroll' : 'pointer';
        dispatch({ type: 'select_tool', payload: newTool });

        // Show toast notification for tool changes
        // Use fixed ID to prevent duplicates from multiple viewports
        if (currentTime - lastToastTime > 500) {
          lastToastTime = currentTime;
          if (newTool === 'pointer') {
            toast.success('Pointer tool selected', {
              id: 'pointer-tool-toggle',
              duration: 1500,
              position: 'bottom-center'
            });
          } else {
            toast.info('Scroll tool selected', {
              id: 'pointer-tool-toggle',
              duration: 1500,
              position: 'bottom-center'
            });
          }
        }
      }

      lastTapTimeRef.current = currentTime;
    };

    // Add listeners for both touch and mouse events
    elementRef.current.addEventListener('touchstart', handleDoubleTap);
    elementRef.current.addEventListener('click', handleDoubleTap);

    return () => {
      if (elementRef.current) {
        elementRef.current.removeEventListener('touchstart', handleDoubleTap);
        elementRef.current.removeEventListener('click', handleDoubleTap);
      }
    };
  }, [viewportReady, dispatch, toolSelected, sharingUser]);


  // Ref to track previous data to prevent unnecessary reloads
  const prevDataRef = useRef(null);

  useEffect(() => {
    let cleanup;
    // Only load if data exists
    if (viewport_data) {
      const prev = prevDataRef.current;
      // Compare stack by first URL string (not reference) — reducer spreads create new array refs
      const prevFirstUrl = prev?.s?.[0];
      const newFirstUrl = viewport_data?.s?.[0];
      const isStackSame = prev && prevFirstUrl === newFirstUrl;
      const isWindowSame = prev && prev.ww === viewport_data.ww && prev.wc === viewport_data.wc;
      const isCiChanged = prev && prev.ci !== viewport_data.ci;

      // Guard: If nothing relevant changed, do nothing
      if (prev && isStackSame && isWindowSame && !isCiChanged && viewportReady) {
        prevDataRef.current = viewport_data;
        return;
      }

      // Smart Update: If stack is same, apply slice and/or windowing changes without a full reload
      if (isStackSame && viewportReady) {
        const viewportId = `${viewport_idx}-vp`;
        const viewport = rendering_engine.getViewport(viewportId);

        if (viewport) {
          // 1. Handle Windowing Changes
          if (!isWindowSame) {
            const { ww, wc } = viewport_data;
            viewport.setProperties({
              voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
              isComputedVOI: false,
            });
          }

          // 2. Handle Slice (CI) Changes
          if (isCiChanged) {
            const targetNumber = parseInt(viewport_data.ci, 10);
            if (!isNaN(targetNumber)) {
              const getNumber = (str) => {
                const match = str.match(/(\d+)(?!.*\d)/);
                return match ? parseInt(match[0], 10) : null;
              };
              const foundIndex = viewport_data.s.findIndex(url => getNumber(url) === targetNumber);
              const currentIndex = viewport.getCurrentImageIdIndex();

              if (foundIndex !== -1 && foundIndex !== currentIndex) {
                viewport.setImageIdIndex(foundIndex);
              }
            }
          }

          // 3. Final render if anything changed
          if (!isWindowSame || isCiChanged) {
            viewport.render();
          }
        }

        prevDataRef.current = viewport_data;
        return;
      }

      // Full Reload
      setViewportReady(false);
      loadImagesAndDisplay().then(c => cleanup = c);
      prevDataRef.current = viewport_data;
    }
    return cleanup;
  }, [viewport_data, rendering_engine, viewport_idx, dispatch]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Segmented Progress Bar (from Remote Staging) */}
      {viewport_data && !allImagesLoaded && viewport_data.s.length > 1 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          display: 'flex',
          gap: '1px',
          zIndex: 10, // Lower z-index to appear underneath dialogs
          pointerEvents: 'none',
          opacity: allImagesLoaded ? 0 : 1,
          transition: 'opacity 0.5s ease-out'
        }}>
          {(() => {
            // Calculate optimal segment count to prevent clutter on small screens
            const MAX_SEGMENTS = 100;
            const totalImages = viewport_data.s.length;
            const segmentCount = Math.min(totalImages, MAX_SEGMENTS);
            const imagesPerSegment = Math.ceil(totalImages / segmentCount);

            return Array.from({ length: segmentCount }).map((_, segmentIdx) => {
              const startIdx = segmentIdx * imagesPerSegment;
              const endIdx = Math.min(startIdx + imagesPerSegment, totalImages);

              // Check if current image is in this segment
              const isCurrent = currentImageIndex >= startIdx && currentImageIndex < endIdx;

              // Check if any image in this segment is loaded
              let hasLoaded = false;
              for (let i = startIdx; i < endIdx; i++) {
                if (loadedImages.has(i)) {
                  hasLoaded = true;
                  break;
                }
              }

              // Two states: Current (red) or Loaded (green) or Unloaded (gray)
              const backgroundColor = isCurrent
                ? '#F87171'  // Current segment - red
                : hasLoaded
                  ? '#4CAF50'  // At least one loaded - green
                  : 'rgba(255, 255, 255, 0.2)';  // None loaded - transparent white

              return (
                <div
                  key={segmentIdx}
                  style={{
                    flex: 1,
                    height: '100%',
                    backgroundColor,
                    transition: 'background-color 0.3s ease'
                  }}
                />
              );
            });
          })()}
        </div>
      )}

      <div ref={elementRef} id={viewport_idx} style={{ width: '100%', height: '100%' }} >

        {/* Shared Pointer - Always rendered but toggled via ref for performance */}
        <svg
          ref={pointerRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            // Initial state hidden
            display: 'none',
            width: 24,
            height: 24,
            zIndex: 1000,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
            transition: 'display 0.1s' // smooth toggle
          }}
          viewBox="0 0 24 24"
          fill="none"
        >
          {/* Outer white stroke for contrast */}
          <path
            d="M5 3L19 12L12 13L9 20L5 3Z"
            fill="white"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Inner red pointer */}
          <path
            d="M5 3L19 12L12 13L9 20L5 3Z"
            fill="#EF4444"
            stroke="#DC2626"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>

      </div>

      {/* Slice Indicator */}
      {viewport_data && viewport_data.s.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 140, // Offset to the right of the share button
          zIndex: 100,
          background: 'rgba(15, 15, 20, 0.75)', // Slightly more transparent background
          color: 'rgba(255, 255, 255, 0.8)', // Softer white for the label text
          padding: '4px 8px', // Reduced padding
          borderRadius: 6, // Slightly smaller border radius
          fontSize: 12, // Reduced font size
          fontWeight: 400, // Lighter font weight for the label
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          fontFamily: 'Inter, system-ui, sans-serif',
          pointerEvents: 'none',
          letterSpacing: '0.01em',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', // Softer shadow
        }}>
          Slice <span style={{ color: 'white', fontWeight: 600 }}>{currentImageIndex + 1}</span> / {viewport_data.s.length}
        </div>
      )}
    </div>
  );
}