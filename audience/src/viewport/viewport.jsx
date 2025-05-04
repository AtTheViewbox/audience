import React, { useRef, useContext, useEffect,useState } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import LoadingPage from '../components/LoadingPage.jsx';
import { Circle } from "lucide-react"
import { smallestInStack } from '../lib/inputParser.ts';



export default function Viewport(props) {
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get("preview") === "true";
  const elementRef = useRef(null);

  const { vd,toolSelected,s,isRequestLoading,coordData,sharingUser,  } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const [viewportReady, setViewportReady] = useState(false);
  const { viewport_idx, rendering_engine } = props;
  const viewport_data = vd[viewport_idx];
  const [dotPos, setDotPos] = useState([0, 0]);

  const { dispatch } = useContext(DataDispatchContext);
  const [isLoading,setIsLoading] = useState(true);
  const [initalLoad, SetInitalLoad] = useState(true);

  useEffect(()=>{
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    

    if (isLoading ) return;
    
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
    switch(toolSelected){
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
    const { s, ww, wc,px,py,ci,z} = viewport_data;

    var currentIndex = ci - smallestInStack(s) + 1;

    const stack = s;
    await viewport.setStack(stack, (currentIndex < 0 || isPreview) ? 0 : currentIndex);

  
  // Apply to current viewport dimensions with zoom consideration
  const panX = (px / 400 * viewport.canvas.clientWidth) / z;
  const panY = ( py / 400 * viewport.canvas.clientHeight) / z;
 
    //viewport.setZoom(z);
    //viewport.setPan([panX, panY]);

    viewport.setProperties({
      voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
      isComputedVOI: false,
    });


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
      ProbeTool,
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
      toolGroup.addTool(ProbeTool.toolName);

    if (mobile) {
  
      toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
      toolGroup.setToolActive(PanTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
      toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
      toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ numTouchPoints: 3 }], });


    } else {
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
    if (viewport_data && !isRequestLoading && viewportReady) {  

      const viewportId = `${viewport_idx}-vp`;
      const viewport = (
        rendering_engine.getViewport(viewportId)
      );
      const canvasCoord = viewport.worldToCanvas([coordData.coord[0], coordData.coord[1], coordData.coord[2]]);
      setDotPos([canvasCoord[0],  canvasCoord[1] ]);

    }
  }, [coordData]);

  useEffect(() => {
    if (viewport_data && !isRequestLoading) {  
 
      loadImagesAndDisplay().then(() => {
        if (initalLoad){
          setViewportReady(true);
          addCornerstoneTools()
        }
        setIsLoading(false)
      });
    }
    return () => { console.log("unmounting viewport"); };
  }, [vd,isRequestLoading]);


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={elementRef} id={viewport_idx} style={{ width: '100%', height: '100%'}} >
        {(isRequestLoading)?<LoadingPage/>:null}
        {coordData && coordData.viewport ==`${viewport_idx}-vp` && sharingUser && userData.id != sharingUser && dotPos && <Circle style={{
            position: 'absolute',
            left: `${dotPos[0]}px`,
            top: `${dotPos[1]}px`,
            transform: 'translate(-50%, -50%)',
            color: 'red',
            width: 15,
            height: 15,
            zIndex: 1000,
          }}/>}
        
        </div>
    </div>
  );
}


