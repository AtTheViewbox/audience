import React, { useRef, useContext, useEffect, useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Circle } from "lucide-react"
import { ImageLoaderQueue } from '../lib/ImageLoaderQueue.ts'; // Import the new class


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
  }, [coordData, viewportReady, viewport_data, rendering_engine, viewport_idx, sharingUser, userData.id]);

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
      StackScrollMouseWheelTool,
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
        toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: false });
        toolGroup.setToolActive(WindowLevelTool.toolName);
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }], });
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }], });
        toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
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

    setLoadedImages(new Set([initialIndex]));
    setAllImagesLoaded(false);

    try {
      await cornerstone.imageLoader.loadAndCacheImage(s[initialIndex], { priority: 100 });
      setLoadedImages(new Set([initialIndex]));

      // Initial Stack: Only image at initialIndex
      await viewport.setStack([s[initialIndex]], 0);

      viewport.setProperties({
        voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
        isComputedVOI: false,
      });

      addCornerstoneTools();
      setViewportReady(true);
      setSortedLoadedIndices([initialIndex]);

      // Start the intelligent queue
      startQueue(s, viewportId, initialIndex);

      const handleImageChange = (event) => {
        // Find real index 
        const imageId = viewport.getCurrentImageId();
        const realIndex = s.indexOf(imageId);
        setCurrentImageIndex(realIndex);

        if (queueRef.current) {
          queueRef.current.updateFocus(realIndex);
        }

        if (ww && wc) {
          const viewport = rendering_engine.getViewport(`${viewport_idx}-vp`);
          if (viewport) {
            viewport.setProperties({
              voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
              isComputedVOI: false,
            });
          }
        }
      };
      elementRef.current?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);

      return () => {
        elementRef.current?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);

        // Log performance metrics before destroying
        if (queueRef.current) {
          const metrics = queueRef.current.getMetrics();
          console.log('📊 Final loading metrics:', metrics);
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

    const queue = new ImageLoaderQueue(allImageIds, 3, (loadedIndex) => {
      setLoadedImages(prev => {
        const newSet = new Set(prev);
        newSet.add(loadedIndex);
        if (newSet.size === allImageIds.length) {
          setAllImagesLoaded(true);
        }
        return newSet;
      });
    }, isMobile);

    queueRef.current = queue;
    queue.updateFocus(initialIndex);
    queue.start();
  };

  // Effect: When loadedImages changes, update the stack
  useEffect(() => {
    if (rendering_engine && viewportReady && viewport_data) {
      const viewport = rendering_engine.getViewport(`${viewport_idx}-vp`);
      if (!viewport) return;

      const sortedIndices = Array.from(loadedImages).sort((a, b) => a - b);
      // Only update if count changed
      if (sortedIndices.length !== sortedLoadedIndices.length) {
        const denseStack = sortedIndices.map(idx => viewport_data.s[idx]);

        // Find where the current image is in the NEW stack
        const currentId = viewport.getCurrentImageId();
        const newIndex = denseStack.indexOf(currentId);

        // Keep position if possible, otherwise default to 0
        viewport.setStack(denseStack, newIndex !== -1 ? newIndex : 0);

        setSortedLoadedIndices(sortedIndices);
      }
    }
  }, [loadedImages, viewportReady, rendering_engine]);



  useEffect(() => {
    let cleanup;
    // Only load if data exists
    if (viewport_data) {
      setViewportReady(false); // Reset ready state on new data
      loadImagesAndDisplay().then(c => cleanup = c);
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [vd]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Segmented Progress Bar (from Remote Staging) */}
      {viewport_data && !allImagesLoaded && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          display: 'flex',
          gap: '1px',
          zIndex: 1000,
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

              const backgroundColor = isCurrent
                ? '#F87171'  // Current segment - red/orange
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
    </div>
  );
}