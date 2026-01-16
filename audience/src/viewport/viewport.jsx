import React, { useRef, useContext, useEffect, useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Circle } from "lucide-react"


export default function Viewport(props) {
  const searchParams = new URLSearchParams(location.search);
  const elementRef = useRef(null);

  const { vd, toolSelected, coordData, sharingUser } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const { viewport_idx, rendering_engine } = props;
  const [viewportReady, setViewportReady] = useState(false);
  const viewport_data = vd[viewport_idx];
  const [dotPos, setDotPos] = useState([0, 0]);

  const { dispatch } = useContext(DataDispatchContext);

  // New state from remote for Progress Bar
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [allImagesLoaded, setAllImagesLoaded] = useState(false);

  useEffect(() => {
    // Only update dot position if everything is ready
    if (viewport_data && viewportReady) {
      const viewportId = `${viewport_idx}-vp`;
      const viewport = rendering_engine.getViewport(viewportId);
      if (viewport && coordData?.coord) {
        // Check valid coords before mapping
        const canvasCoord = viewport.worldToCanvas([coordData.coord[0], coordData.coord[1], coordData.coord[2]]);
        setDotPos([canvasCoord[0], canvasCoord[1]]);
      }
    }
  }, [coordData, viewportReady, viewport_data, rendering_engine, viewport_idx]);

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
        toolGroup.setToolActive(ProbeTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
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
        toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
      }

      toolGroup.addViewport(`${viewport_idx}-vp`, 'myRenderingEngine');
    }
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

    // Reset progress state
    setLoadedImages(new Set());
    setAllImagesLoaded(false);

    // OPTIMIZATION: Progressive Loading - Load first image immediately
    try {
      await cornerstone.imageLoader.loadAndCacheImage(s[0], {
        priority: 0,
        requestType: 'interaction'
      });

      // Update loaded state for first image
      setLoadedImages(new Set([0]));

      // Display first image immediately
      // IMPORTANT: We set the stack but don't await the FULL load if we want to proceed.
      await viewport.setStack(s, 0);

      viewport.setProperties({
        voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
        isComputedVOI: false,
      });

      // Unlock readiness immediately after first image
      addCornerstoneTools();
      setViewportReady(true);

      // Setup listener for image navigation (from upstream)
      const handleImageChange = (event) => {
        setCurrentImageIndex(event.detail.imageIdIndex);
      };
      elementRef.current?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);

      // Continue loading the rest in background (non-blocking)
      loadRestOfImages(s);

      // Return cleanup function for the listener
      return () => {
        elementRef.current?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);
      };

    } catch (e) {
      console.error("Error loading first image", e);
    }
  };

  const loadRestOfImages = async (imageIds) => {
    const prefetchPromises = imageIds.slice(1).map((imageId, idx) => {
      // Lower priority for background images
      return cornerstone.imageLoader.loadAndCacheImage(imageId, {
        priority: idx + 1,
        requestType: 'prefetch'
      }).then(() => {
        // Update loaded images set for progress bar
        setLoadedImages(prev => {
          const newSet = new Set(prev);
          newSet.add(idx + 1);
          return newSet;
        });
      });
    });

    try {
      await Promise.all(prefetchPromises);
      setAllImagesLoaded(true);
    } catch (e) {
      console.error("Error prefetching images", e);
    }
  };


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
          {Array.from({ length: viewport_data.s.length }).map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: '100%',
                backgroundColor:
                  idx === currentImageIndex
                    ? '#F87171'  // Current image - red/orange (using tailwind red-400 roughly)
                    : loadedImages.has(idx)
                      ? '#4CAF50'  // Loaded - green
                      : 'rgba(255, 255, 255, 0.2)',  // Not loaded - transparent white
                transition: 'background-color 0.3s ease'
              }}
            />
          ))}
        </div>
      )}

      <div ref={elementRef} id={viewport_idx} style={{ width: '100%', height: '100%' }} >

        {coordData && coordData.viewport == `${viewport_idx}-vp` && sharingUser && userData.id != sharingUser && dotPos && <Circle style={{
          position: 'absolute',
          left: `${dotPos[0]}px`,
          top: `${dotPos[1]}px`,
          transform: 'translate(-50%, -50%)',
          color: 'red',
          width: 15,
          height: 15,
          zIndex: 1000,
        }} />}

      </div>
    </div>
  );
}