import { Events as TOOLS_EVENTS } from '@cornerstonejs/tools/src/enums';
import { eventTarget, Enums } from '@cornerstonejs/core';

import { getAnnotationManager } from '@cornerstonejs/tools/src/stateManagement/annotation/annotationState';


export const attach = () => {
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_ADDED,
    () => {
      const annotationManager = getAnnotationManager();
      console.log("ianto added", annotationManager);
    })
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_MODIFIED,
    () => {
      const annotationManager = getAnnotationManager();
      console.log("ianto modified", annotationManager);
    })
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_REMOVED,
    () => {
      const annotationManager = getAnnotationManager();
      console.log("ianto removed", annotationManager);
    })
}
