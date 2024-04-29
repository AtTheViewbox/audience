/* eslint-disable @typescript-eslint/no-empty-function */
import { vec2 } from 'gl-matrix';

import {
  getEnabledElement,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  AnnotationTool,
} from '@cornerstonejs/tools';

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '@cornerstonejs/tools/src/stateManagement/annotation/annotationState';

import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '@cornerstonejs/tools/src/stateManagement/annotation/helpers/state';

import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '@cornerstonejs/tools/src/drawingSvg';

import { state } from '@cornerstonejs/tools/src/store';
import { Events } from '@cornerstonejs/tools/src/enums';
import { getViewportIdsWithToolToRender } from '@cornerstonejs/tools/src/utilities/viewportFilters';
import { roundNumber } from '@cornerstonejs/tools/src/utilities';
import {
  resetElementCursor,
  hideElementCursor,
} from '@cornerstonejs/tools/src/cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '@cornerstonejs/tools/src/utilities/triggerAnnotationRenderForViewportIds';

import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '@cornerstonejs/tools/src/types';
import { ProbeAnnotation } from '@cornerstonejs/tools/src/types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '@cornerstonejs/tools/src/types/AnnotationStyle';
import { isViewportPreScaled } from '@cornerstonejs/tools/src/utilities/viewport/isViewportPreScaled';

const { transformWorldToIndex } = csUtils;

/**
 * FlagTool drops a flag. Based off the ProbeTool.
 * https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/tools/src/tools/annotation/ProbeTool.ts
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * To use the FlagTool, you first need to add it to cornerstoneTools, then create
 * a toolGroup and add the FlagTool to it. Finally, setToolActive on the toolGroup
 *
 * ```js
 * cornerstoneTools.addTool(FlagTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(FlagTool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(FlagTool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.
 *
 */

class FlagTool extends AnnotationTool {
  static toolName;

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    newAnnotation?: boolean;
  } | null;
  eventDispatchDetail: {
    viewportId: string;
    renderingEngineId: string;
  };
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        getTextLines: defaultGetTextLines,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  // Not necessary for this tool but needs to be defined since it's an abstract
  // method from the parent class.
  isPointNearTool(): boolean {
    return false;
  }

  toolSelectedCallback() {}

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Probe Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): ProbeAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = false;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation = {
      invalidated: true,
      highlighted: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        label: '',
        handles: { points: [<Types.Point3>[...worldPos]] },
        cachedStats: {},
      },
    };

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      newAnnotation: true,
      viewportIdsToRender,
    };

    evt.preventDefault();

    this._calculateCachedStats(annotation, renderingEngine, enabledElement);

    triggerAnnotationCompleted(annotation);
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    return annotation;
  };

  /**
   * It checks if the mouse click is near FlagTool, it overwrites the baseAnnotationTool
   * getHandleNearImagePoint method.
   *
   * @param element - The element that the tool is attached to.
   * @param annotation - The annotation object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: ProbeAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const point = data.handles.points[0];
    const annotationCanvasCoordinate = viewport.worldToCanvas(point);

    const near =
      vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity;

    if (near === true) {
      return point;
    }
  }

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: ProbeAnnotation
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      annotation,
      viewportIdsToRender,
    };

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    console.log("test", "ianto");

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  }

  /**
   * it is used to draw the flag annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);
    console.log(annotations);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as ProbeAnnotation;
      const annotationUID = annotation.annotationUID;
      const data = annotation.data;
      const point = data.handles.points[0];
      const canvasCoordinates = viewport.worldToCanvas(point);

      styleSpecifier.annotationUID = annotationUID;

      const { color } = this.getAnnotationStyle({ annotation, styleSpecifier });

      if (!data.cachedStats) {
        data.cachedStats = {};
      }

      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].value == null
      ) {
        data.cachedStats[targetId] = {
          Modality: null,
          index: null,
          value: null,
        };

        this._calculateCachedStats(annotation, renderingEngine, enabledElement);
      } else if (annotation.invalidated) {
        this._calculateCachedStats(annotation, renderingEngine, enabledElement);

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = annotation.metadata;

          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          for (const targetId in data.cachedStats) {
            if (targetId.startsWith('imageId')) {
              const viewports = renderingEngine.getStackViewports();

              const invalidatedStack = viewports.find((vp) => {
                // The stack viewport that contains the imageId but is not
                // showing it currently
                const referencedImageURI =
                  csUtils.imageIdToURI(referencedImageId);
                const hasImageURI = vp.hasImageURI(referencedImageURI);
                const currentImageURI = csUtils.imageIdToURI(
                  vp.getCurrentImageId()
                );
                return hasImageURI && currentImageURI !== referencedImageURI;
              });

              if (invalidatedStack) {
                delete data.cachedStats[targetId];
              }
            }
          }
        }
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      const handleGroupUID = '0';

      drawHandlesSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        [canvasCoordinates],
        { color }
      );

      renderStatus = true;

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        continue;
      }

      const textLines = this.configuration.getTextLines(data, targetId);
      if (textLines) {
        const textCanvasCoordinates = [
          canvasCoordinates[0] + 6,
          canvasCoordinates[1] - 6,
        ];

        const textUID = '0';
        drawTextBoxSvg(
          svgDrawingHelper,
          annotationUID,
          textUID,
          textLines,
          [textCanvasCoordinates[0], textCanvasCoordinates[1]],
          options
        );
      }
    }

    return renderStatus;
  };

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data;
    const { renderingEngineId, viewport } = enabledElement;
    const { element } = viewport;

    const worldPos = data.handles.points[0];
    const { cachedStats } = data;

    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const modalityUnitOptions = {
        isPreScaled: isViewportPreScaled(viewport, targetId),
        isSuvScaled: this.isSuvScaled(
          viewport,
          targetId,
          annotation.metadata.referencedImageId
        ),
      };

      const image = this.getTargetIdImage(targetId, renderingEngine);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { dimensions, imageData, metadata } = image;
      const scalarData =
        'getScalarData' in image ? image.getScalarData() : image.scalarData;

      const modality = metadata.Modality;
      const index = transformWorldToIndex(imageData, worldPos);

      index[0] = Math.round(index[0]);
      index[1] = Math.round(index[1]);
      index[2] = Math.round(index[2]);

      const samplesPerPixel =
        scalarData.length / dimensions[2] / dimensions[1] / dimensions[0];

      if (csUtils.indexWithinDimensions(index, dimensions)) {
        this.isHandleOutsideImage = false;
        const yMultiple = dimensions[0] * samplesPerPixel;
        const zMultiple = dimensions[0] * dimensions[1] * samplesPerPixel;

        const baseIndex =
          index[2] * zMultiple +
          index[1] * yMultiple +
          index[0] * samplesPerPixel;
        let value =
          samplesPerPixel > 2
            ? [
                scalarData[baseIndex],
                scalarData[baseIndex + 1],
                scalarData[baseIndex + 2],
              ]
            : scalarData[baseIndex];

        // Index[2] for stackViewport is always 0, but for visualization
        // we reset it to be imageId index
        if (targetId.startsWith('imageId:')) {
          const imageId = targetId.split('imageId:')[1];
          const imageURI = csUtils.imageIdToURI(imageId);
          const viewports = csUtils.getViewportsWithImageURI(
            imageURI,
            renderingEngineId
          );

          const viewport = viewports[0];

          index[2] = viewport.getCurrentImageIdIndex();
        }

        cachedStats[targetId] = {
          index,
          value,
          Modality: modality,
        };
      } else {
        this.isHandleOutsideImage = true;
        cachedStats[targetId] = {
          index,
          Modality: modality,
        };
      }

      annotation.invalidated = false;

      // Dispatching annotation modified
      triggerAnnotationModified(annotation, element);
    }

    return cachedStats;
  }
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { index, value } = cachedVolumeStats;

  if (value === undefined) {
    return;
  }

  const textLines = [];
  return textLines;
}

FlagTool.toolName = 'Flag';
export default FlagTool;
