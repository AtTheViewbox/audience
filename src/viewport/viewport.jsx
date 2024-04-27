import React, { useRef, useContext, useEffect } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';


export default function Viewport(props) {
  const elementRef = useRef(null);

  const { vd, channels, sharing } = useContext(DataContext).data;
  const { viewport_idx, rendering_engine } = props;
  const viewport_data = vd[viewport_idx];

  const { dispatch } = useContext(DataDispatchContext);

  useEffect(() => {

    // channels[viewport_idx].subscribe((status) => {
    //   // Wait for successful connection
    //   console.log(status)
    //   if (status === 'SUBSCRIBED') {
    //     console.log(viewport_idx, "channel subscribed")
    //     return null
    //   }
    // })

    const loadImagesAndDisplay = async () => {

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

      const { s, ww, wc } = viewport_data;

      s.map((imageId) => {
        cornerstone.imageLoader.loadAndCacheImage(imageId);
      });

      const stack = s;
      await viewport.setStack(stack);

      viewport.setProperties({
        voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
        isComputedVOI: false,
      });

      // elementRef.current.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', (event) => {
      //   channels[viewport_idx].send({
      //     type: 'broadcast',
      //     event: 'master',
      //     payload: { message: event.detail.imageIdIndex, viewport: viewportId },
      //   })
      // })

      // channels[viewport_idx].on(
      //   'broadcast',
      //   { event: 'master' },
      //   (payload) => {
      //     console.log(payload)
      //     // if (m == 'false') {
      //       if (payload.payload.viewport == viewportId) {
      //         viewport.setImageIdIndex(payload.payload.message);
      //       }
      //     // } 
      //   }
      // )

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
        toolGroup.addTool(StackScrollTool.toolName, { loop: false });

        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }], });
        toolGroup.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ numTouchPoints: 3 }], });

      } else {
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: false });

        toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }], });
        toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }], });
        toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }], });
        toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
      }

      toolGroup.addViewport(`${viewport_idx}-vp`, 'myRenderingEngine');
    };

    console.log("mounting viewport");
    if (viewport_data) {
      loadImagesAndDisplay().then(() => {
        addCornerstoneTools();
      });
    }
    return () => { console.log("unmounting viewport"); };
  }, []);


  return (
    <>
      <div ref={elementRef} id={viewport_idx} style={{ width: '100%', height: '100%' }} />
    </>
  );
}