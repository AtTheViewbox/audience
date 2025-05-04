import React, { useRef, useContext, useEffect,useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import LoadingPage from '../components/LoadingPage.jsx';
import { smallestInStack } from '../lib/inputParser.js';


export default function Viewport(props) {
  const elementRef = useRef(null);

  const { vd, channels, sharing, toolSelected,s,isRequestLoading } = useContext(DataContext).data;
  const { viewport_idx, rendering_engine } = props;
  const viewport_data = vd[viewport_idx];
  console.log(viewport_data)

  const { dispatch } = useContext(DataDispatchContext);
  const [isLoading,setIsLoading] = useState(true);
  const [initalLoad, SetInitalLoad] = useState(true);

  useEffect(()=>{
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    if (isLoading || mobile) return;
    
    const {
      PanTool,
      WindowLevelTool,
      StackScrollTool,
      StackScrollMouseWheelTool,
      ZoomTool,
      PlanarRotateTool,
      ToolGroupManager,
      Enums: csToolsEnums,
    } = cornerstoneTools;
    
    const { MouseBindings } = csToolsEnums;
    const toolGroupId = `${viewport_idx}-tl`;

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    switch(toolSelected){
      case "pan":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "window":
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "zoom":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(StackScrollTool.toolName);
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
      case "scroll":
        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        break;
    }

  },[toolSelected])

  const loadImagesAndDisplay = async () => {
    //setIsLoading(true)
    const viewportId = `${viewport_idx}-vp`;
    const viewportInput = {
      viewportId,
      type: cornerstone.Enums.ViewportType.STACK,
      element: elementRef.current,
      defaultOptions: {

      },
    };

    rendering_engine.enableElement(viewportInput);
    console.log(viewportId, "enabled")
    dispatch({type: 'viewport_ready', payload: {viewportId: viewport_idx}})

    const viewport = (
      rendering_engine.getViewport(viewportId)
    );

    const { s, ww, wc,z,px,py,ci } = viewport_data;


    s.map((imageId) => {
      cornerstone.imageLoader.loadAndCacheImage(imageId);
    });
    
    const stack = s;
    console.log(ci,ci-smallestInStack(s))
    var currentIndex  = ci-smallestInStack(s)+1
    
    await viewport.setStack(stack,currentIndex<0?0:currentIndex );
    console.log(viewport,viewport.canvas)
    viewport.setZoom(z); 
    viewport.setPan([px*(viewport.canvas.width/400),py*(viewport.canvas.height/400)]);

    viewport.setProperties({
      voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
      isComputedVOI: false,
    });
   
    
    viewport.render();
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

    if (mobile) {
      toolGroup.addTool(WindowLevelTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);
      toolGroup.addTool(StackScrollTool.toolName);

      toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
      toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
      toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ numTouchPoints: 3 }], });

    } else {
      toolGroup.addTool(WindowLevelTool.toolName);
      toolGroup.addTool(PanTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);
      toolGroup.addTool(StackScrollTool.toolName, { loop: false });
      toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: false });

      toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
      toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }], });
      toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }], });
      toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    }

    toolGroup.addViewport(`${viewport_idx}-vp`, 'myRenderingEngine');
    SetInitalLoad(false)
  };

  useEffect(() => {
    if (viewport_data && !isRequestLoading) {  
 
      loadImagesAndDisplay().then(() => {
        if (initalLoad){
          addCornerstoneTools()
        }
        setIsLoading(false)
      });
    }
    return () => { console.log("unmounting viewport"); };
  }, [vd,isRequestLoading]);


  return (
   <>
      <div ref={elementRef} id={viewport_idx} style={{ width: '100%', height: '100%'}} >
        {(isRequestLoading)?<LoadingPage/>:null}
        </div>
    </>
  );
}