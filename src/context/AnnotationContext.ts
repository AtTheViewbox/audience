import { Events as TOOLS_EVENTS } from '@cornerstonejs/tools/src/enums';
import { eventTarget, Enums } from '@cornerstonejs/core';

import { getAnnotationManager } from '@cornerstonejs/tools/src/stateManagement/annotation/annotationState';


export const attach = annotationManager => {
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_ADDED,
    (e) => {
      console.log("ianto added", annotationManager, e);
    })
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_MODIFIED,
    (e) => {
      console.log("ianto modified", annotationManager, e);
    })
  eventTarget.addEventListener(
    TOOLS_EVENTS.ANNOTATION_REMOVED,
    (e) => {
      console.log("ianto removed", annotationManager, e);
    })

  /* note that the below currently does not work,
   * needs to actually be bound to an HTML element most likely.
   * the question is... which one?
   */
  eventTarget.addEventListener(
    TOOLS_EVENTS.MOUSE_MOVE,
    (e) => {
      console.log("ianto moved", annotationManager, e);
    })
}
