import React, { useRef, useContext, useEffect, useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import LoadingPage from '../components/LoadingPage.jsx';
import { smallestInStack } from '../lib/inputParser.ts';
import { Circle } from "lucide-react"


export default function Viewport(props) {
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get("preview") === "true";
  const elementRef = useRef(null);

  const { vd, channels, sharing, toolSelected, s, isRequestLoading, coordData, sharingUser } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const { viewport_idx, rendering_engine } = props;
  const [viewportReady, setViewportReady] = useState(false);
  const viewport_data = vd[viewport_idx];
  const [dotPos, setDotPos] = useState([0, 0]);

  const { dispatch } = useContext(DataDispatchContext);
  const [isLoading, setIsLoading] = useState(true);
  const [initalLoad, SetInitalLoad] = useState(true);
  const [perfMetrics, setPerfMetrics] = useState(null);
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [allImagesLoaded, setAllImagesLoaded] = useState(false);

  useEffect(() => {
    if (viewport_data && !isRequestLoading && viewportReady) {

      const viewportId = `${viewport_idx}-vp`;
      const viewport = (
        rendering_engine.getViewport(viewportId)
      );
      const canvasCoord = viewport.worldToCanvas([coordData.coord[0], coordData.coord[1], coordData.coord[2]]);
      setDotPos([canvasCoord[0], canvasCoord[1]]);

    }
  }, [coordData]);

  useEffect(() => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);


    if (isLoading) return;

    const {
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      StackScrollMouseWheelTool,
      ZoomTool,
      PlanarRotateTool,
      ProbeTool,
      ToolGroupManager,
      Enums: csToolsEnums,
    } = cornerstoneTools;

    const { MouseBindings } = csToolsEnums;
    const toolGroupId = `${viewport_idx}-tl`;

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
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
        //if (mobile){toolGroup.setToolActive(ProbeTool.toolName,{ bindings: [{ mouseButton: MouseBindings.Primary }], });}
        toolGroup.setToolActive(ProbeTool.toolName);
        break;
    }

  }, [toolSelected])

  const loadImagesAndDisplay = async () => {
    const perfStart = performance.now();
    const metrics = {
      totalStart: perfStart,
      firstImageLoadTime: 0,
      firstImageDisplayTime: 0,
      totalImageLoadTime: 0,
      stackSetTime: 0,
      totalTime: 0,
      imageCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    const viewportId = `${viewport_idx}-vp`;
    const viewportInput = {
      viewportId,
      type: cornerstone.Enums.ViewportType.STACK,
      element: elementRef.current,
      defaultOptions: {},
    };

    rendering_engine.enableElement(viewportInput);
    console.log(viewportId, "enabled");

    dispatch({ type: 'viewport_ready', payload: { viewportId: viewport_idx } });

    const viewport = rendering_engine.getViewport(viewportId);
    const { s, ww, wc } = viewport_data;
    metrics.imageCount = s.length;


    // OPTIMIZATION 2: Progressive Loading - Load first image immediately
    const firstImageStart = performance.now();
    
    const firstImage = await cornerstone.imageLoader.loadAndCacheImage(s[0], {
      priority: 0,
      requestType: 'interaction'
    });
    
    setLoadedImages(new Set([0]));
    
    metrics.firstImageLoadTime = performance.now() - firstImageStart;
    console.log(`%c✅ First image loaded in ${metrics.firstImageLoadTime.toFixed(2)}ms`, 'color: #4CAF50; font-weight: bold');

    // Display first image immediately
    const stackSetStart = performance.now();
    await viewport.setStack(s, 0);
    metrics.stackSetTime = performance.now() - stackSetStart;
    metrics.firstImageDisplayTime = performance.now() - perfStart;
    
    console.log(`%c🎨 First image DISPLAYED in ${metrics.firstImageDisplayTime.toFixed(2)}ms`, 'color: #FF9800; font-weight: bold; font-size: 13px');

    viewport.setProperties({
      voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
      isComputedVOI: false,
    });

    const prefetchStart = performance.now();
    let loadedCount = 1; // First image already loaded
    
    const prefetchPromises = s.slice(1).map((imageId, idx) => {
      return cornerstone.imageLoader.loadAndCacheImage(imageId, {
        priority: idx + 1,
        requestType: 'prefetch'
      }).then(() => {
        loadedCount++;
        setLoadedImages(prev => new Set([...prev, idx + 1]));
        if (loadedCount % 10 === 0 || loadedCount === s.length) {
          console.log(`%c   📊 Progress: ${loadedCount}/${s.length} images loaded`, 'color: #607D8B');
        }
      });
    });

    await Promise.all(prefetchPromises);
    metrics.totalImageLoadTime = performance.now() - prefetchStart;
    metrics.totalTime = performance.now() - perfStart;

    // Mark all images as loaded
    setAllImagesLoaded(true);

    // Display performance metrics
    console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'color: #4CAF50; font-weight: bold');
    console.log(`%c📊 PERFORMANCE METRICS - VIEWPORT ${viewport_idx}`, 'color: #4CAF50; font-weight: bold; font-size: 14px');
    console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'color: #4CAF50; font-weight: bold');
    console.log(`%c⚡ First Image Display: ${metrics.firstImageDisplayTime.toFixed(2)}ms`, 'color: #FF9800; font-weight: bold');
    console.log(`%c🎯 First Image Load: ${metrics.firstImageLoadTime.toFixed(2)}ms`, 'color: #2196F3');
    console.log(`%c📦 Stack Set Time: ${metrics.stackSetTime.toFixed(2)}ms`, 'color: #2196F3');
    console.log(`%c🔄 Remaining Images Load: ${metrics.totalImageLoadTime.toFixed(2)}ms`, 'color: #9C27B0');
    console.log(`%c⏱️  Total Time: ${metrics.totalTime.toFixed(2)}ms`, 'color: #4CAF50; font-weight: bold');
    console.log(`%c📊 Images Loaded: ${s.length} images`, 'color: #607D8B');
    console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'color: #4CAF50; font-weight: bold');

    setPerfMetrics(metrics);
  };



  const addCornerstoneTools = () => {


    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    const {
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      StackScrollMouseWheelTool,
      ZoomTool,
      ToolGroupManager,
      Enums: csToolsEnums,
    } = cornerstoneTools;

    const { MouseBindings } = csToolsEnums;

    const toolGroupId = `${viewport_idx}-tl`;

    // Define a tool group, which defines how mouse events map to tool commands for
    // Any viewport using the group
    ToolGroupManager.createToolGroup(toolGroupId);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName, { loop: false });

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
    SetInitalLoad(false)
  };

  useEffect(() => {
    if (viewport_data && !isRequestLoading) {

      loadImagesAndDisplay().then(() => {
        if (initalLoad) {
          setViewportReady(true);
          addCornerstoneTools();
          
          // Add event listener to track current image index
          const viewportId = `${viewport_idx}-vp`;
          const viewport = rendering_engine.getViewport(viewportId);
          
          const handleImageChange = (event) => {
            setCurrentImageIndex(event.detail.imageIdIndex);
          };
          
          elementRef.current?.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);
        }
        setIsLoading(false)
      });
    }
    return () => { 
      elementRef.current?.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', handleImageChange);
      console.log("unmounting viewport"); 
    };
  }, [vd, isRequestLoading]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Segmented Progress Bar */}
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
                    ? '#FF9800'  // Current image - orange
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
        {(isRequestLoading) ? <LoadingPage /> : null}
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