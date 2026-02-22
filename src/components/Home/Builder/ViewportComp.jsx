import React, { useRef, useEffect, useState, useMemo } from "react";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { recreateUriStringList, initalValues } from "./builderUtils";
import { Loader2 } from "lucide-react";

// Helper for concurrency limiting
const pLimit = (limit) => {
    const queue = [];
    let active = 0;

    const next = () => {
        if (active >= limit || queue.length === 0) return;
        const fn = queue.shift();
        if (fn) {
            active++;
            fn().finally(() => {
                active--;
                next();
            });
        }
    };

    return async (fn) => {
        queue.push(fn);
        next();
    };
};

const ViewportComp = ({
    metadata,
    stateFlag,
    setStateFlag,
    onUpdate // wrapper ensuring we update the parent list
}) => {
    const elementRef = useRef(null);
    const renderingEngineRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);


    // Unpack metadata safely
    const currentMetadata = metadata || initalValues;



    const stack = useMemo(() => {
        if (!currentMetadata.prefix) return [];
        return recreateUriStringList(
            currentMetadata.prefix,
            currentMetadata.suffix,
            currentMetadata.start_slice,
            currentMetadata.end_slice,
            currentMetadata.pad,
            currentMetadata.step
        );
    }, [
        currentMetadata.prefix,
        currentMetadata.suffix,
        currentMetadata.start_slice,
        currentMetadata.end_slice,
        currentMetadata.pad,
        currentMetadata.step
    ]);

    const viewportId = `preview-vp-${currentMetadata.id}`;
    const renderingEngineId = `preview-engine-${currentMetadata.id}`;

    const updateStates = (event) => {
        const renderingEngine = renderingEngineRef.current;
        if (!renderingEngine) return;

        const vp = renderingEngine.getViewport(viewportId);
        if (!vp) return;

        const properties = vp.getProperties();
        const voiRange = properties.voiRange;

        if (voiRange) {
            // External repo logic: uses toWindowLevel on lower/upper
            const { windowWidth, windowCenter } = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);

            const [x, y] = vp.getPan();
            const zoom = vp.getZoom();

            onUpdate({
                wc: windowCenter,
                ww: windowWidth,
                ci: vp.getCurrentImageIdIndex() + currentMetadata.start_slice,
                z: zoom,
                px: x,
                py: y
            });
        }
    };

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        // We need to store these to clean them up
        let renderingEngine = null;
        let toolGroup = null;
        const toolGroupId = `preview-toolgroup-${currentMetadata.id}`;

        const setupViewport = async () => {
            try {
                // 1. Initialize Cornerstone (idempotent, safe to call multiple times)
                cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
                cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

                cornerstoneDICOMImageLoader.configure({
                    useWebWorkers: false, // Force main thread for reliability
                    decodeConfig: {
                        convertFloatPixelDataToInt: false,
                        use16BitDataType: true
                    }
                });

                console.log("[ViewportComp] Generated Stack URLs:", stack);

                // Register loader
                cornerstone.imageLoader.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.wadouri.loadImage);



                // Register both schemes to be safe

                // Register both schemes to be safe
                // Register both schemes to be safe
                cornerstone.imageLoader.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.wadouri.loadImage);
                cornerstone.imageLoader.registerImageLoader('dicomweb', cornerstoneDICOMImageLoader.wadouri.loadImage);

                await cornerstone.init();
                await cornerstoneTools.init();

                // 2. Create Rendering Engine
                renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
                renderingEngineRef.current = renderingEngine;

                // CRITICAL: Prevent crash if stack is empty
                if (!stack || stack.length === 0) {
                    console.warn("[ViewportComp] Stack is empty. Skipping viewport setup.");
                    setIsLoading(false);
                    return;
                }

                const viewportInput = {
                    viewportId,
                    type: cornerstone.Enums.ViewportType.STACK,
                    element: element,
                    defaultOptions: {
                        background: [0, 0, 0]
                    },
                };

                renderingEngine.enableElement(viewportInput);
                const viewport = renderingEngine.getViewport(viewportId);

                // 3. Add Event Listeners
                element.addEventListener(cornerstone.EVENTS.CAMERA_MODIFIED, updateStates);
                element.addEventListener(cornerstone.EVENTS.VOI_MODIFIED, updateStates);

                // 4. Setup Tools
                const {
                    PanTool,
                    WindowLevelTool,
                    StackScrollMouseWheelTool,
                    ZoomTool,
                    ToolGroupManager,
                    Enums: csToolsEnums,
                } = cornerstoneTools;

                // Cleanup old toolgroup if exists to avoid conflict
                // Note: ToolGroupManager.destroyToolGroup throws if not found in some versions, check existence?
                // Actually destroyToolGroup is safe usually.
                if (ToolGroupManager.getToolGroup(toolGroupId)) {
                    ToolGroupManager.destroyToolGroup(toolGroupId);
                }

                toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

                // Register Tools Global (Idempotent - handled via try/catch for re-mounts)
                try {
                    cornerstoneTools.addTool(WindowLevelTool);
                    cornerstoneTools.addTool(PanTool);
                    cornerstoneTools.addTool(ZoomTool);
                    cornerstoneTools.addTool(StackScrollMouseWheelTool);
                } catch (error) {
                    // Tools might be already added if component is re-mounted.
                    // We ignore this specific error.
                    console.warn("Tools already added or registration failed:", error);
                }

                // Add to Group
                toolGroup.addTool(WindowLevelTool.toolName);
                toolGroup.addTool(PanTool.toolName);
                toolGroup.addTool(ZoomTool.toolName);
                toolGroup.addTool(StackScrollMouseWheelTool.toolName);

                // Set Active
                toolGroup.setToolActive(WindowLevelTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
                });
                toolGroup.setToolActive(PanTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
                });
                toolGroup.setToolActive(ZoomTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
                });
                toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

                toolGroup.addViewport(viewportId, renderingEngineId);

                // 5. Load Images
                setIsLoading(true);
                setLoadError(null);
                const limit = pLimit(5);

                await Promise.all(
                    stack.map((id) => limit(() => cornerstone.imageLoader.loadAndCacheImage(id).catch(e => {
                        console.error("Failed to load image:", id, e);
                        setLoadError(`Failed to load: ${id.split('/').pop()}`);
                        throw e; // Rethrow to trigger main catch
                    })))
                );

                // Set Stack
                const relativeSliceIndex = Math.max(0, (currentMetadata.ci || currentMetadata.start_slice) - currentMetadata.start_slice);

                // Check if component is still mounted before setting stack?
                // (Cleanup function might have run)
                if (!renderingEngineRef.current) return;

                await viewport.setStack(stack, relativeSliceIndex);

                // Sync Rescale Slope/Intercept if missing or default
                if (stack.length > 0) {
                    const image = cornerstone.cache.getImage(stack[0]);
                    if (image) {
                        const { intercept, slope } = image;
                        if (intercept !== undefined && slope !== undefined) {
                            if (currentMetadata.rescaleIntercept !== intercept || currentMetadata.rescaleSlope !== slope) {
                                onUpdate({
                                    rescaleIntercept: intercept,
                                    rescaleSlope: slope
                                });
                            }
                        }
                    }
                }

                await viewport.setStack(stack, relativeSliceIndex);

                // Sync Rescale Slope/Intercept if missing or default
                // This is CRITICAL if the metadata (DB) has default 0/1 but image has real values (e.g. -1024)
                if (stack.length > 0) {
                    const image = cornerstone.cache.getImage(stack[0]);
                    if (image) {
                        const { intercept: imgIntercept, slope: imgSlope } = image;
                        if (imgIntercept !== undefined && imgSlope !== undefined) {
                            if (currentMetadata.rescaleIntercept !== imgIntercept || currentMetadata.rescaleSlope !== imgSlope) {
                                onUpdate({
                                    rescaleIntercept: imgIntercept,
                                    rescaleSlope: imgSlope
                                });
                            }
                        }
                    }
                }

                viewport.setZoom(currentMetadata.z || 1);
                viewport.setPan([Number(currentMetadata.px || 0), Number(currentMetadata.py || 0)]);

                // Use Raw values directly, formatted as Lower/Upper range
                viewport.setProperties({
                    voiRange: cornerstone.utilities.windowLevel.toLowHighRange(currentMetadata.ww, currentMetadata.wc),
                    isComputedVOI: true
                });

                viewport.render();
            } catch (err) {
                console.error("Viewport Setup Error", err);
            } finally {
                // Only set loading false if we didn't crash early or unmount
                if (renderingEngineRef.current) setIsLoading(false);
            }
        };

        setupViewport();

        // Cleanup
        return () => {
            const { ToolGroupManager } = cornerstoneTools;
            if (ToolGroupManager.getToolGroup(toolGroupId)) {
                ToolGroupManager.destroyToolGroup(toolGroupId);
            }

            if (renderingEngineRef.current) {
                renderingEngineRef.current.destroy();
                renderingEngineRef.current = null;
            }

            if (element) {
                element.removeEventListener(cornerstone.EVENTS.CAMERA_MODIFIED, updateStates);
                element.removeEventListener(cornerstone.EVENTS.VOI_MODIFIED, updateStates);
            }
        };
    }, []); // Mount only once

    // React to external State Changes (INPUTS)
    useEffect(() => {
        const update = async () => {
            const renderingEngine = renderingEngineRef.current;
            if (!renderingEngine) return;
            const viewport = renderingEngine.getViewport(viewportId);

            // process only if stateFlag is TRUE (meaning the change came from inputs, not internal interaction)
            if (viewport && stateFlag) {
                const relativeSliceIndex = Math.max(0, (currentMetadata.ci || currentMetadata.start_slice) - currentMetadata.start_slice);

                // We mostly need to update stack if slice range changed, but setStack is cheap if ids are cached
                // Use setStack to ensure we are looking at the right subset if start/end changed
                // But be careful not to reset position if only WW/WC changed? 
                // setStack resets camera?

                // If stack URLs changed (start/end slice changed), we MUST call setStack
                // If only properties, we can skip setStack

                // Check if stack definition matches? 
                // For simplicity, we re-set stack to ensure consistency with inputs
                await viewport.setStack(stack, relativeSliceIndex);

                // Sync Rescale Slope/Intercept if missing or default
                if (stack.length > 0) {
                    const image = cornerstone.cache.getImage(stack[0]);
                    if (image) {
                        const { intercept, slope } = image;
                        if (intercept !== undefined && slope !== undefined) {
                            if (currentMetadata.rescaleIntercept !== intercept || currentMetadata.rescaleSlope !== slope) {
                                onUpdate({
                                    rescaleIntercept: intercept,
                                    rescaleSlope: slope
                                });
                            }
                        }
                    }
                }

                viewport.setZoom(currentMetadata.z || 1);
                viewport.setPan([Number(currentMetadata.px || 0), Number(currentMetadata.py || 0)]);

                viewport.setProperties({
                    voiRange: cornerstone.utilities.windowLevel.toLowHighRange(currentMetadata.ww, currentMetadata.wc),
                    isComputedVOI: true
                });

                viewport.render();
                setStateFlag(false); // Reset flag
            }
        };
        update();
    }, [currentMetadata, stateFlag, stack]); // Depend on metadata and flag

    if (loadError) {
        return (
            <div className="w-full h-full bg-black text-red-500 flex items-center justify-center flex-col gap-2 p-4 text-center">
                <div className="font-bold">Image Load Failed</div>
                <div className="text-xs break-all">{loadError}</div>
            </div>
        );
    }

    if (!stack || stack.length === 0) {
        return (
            <div className="w-full h-full bg-black text-white flex items-center justify-center flex-col gap-2">
                <div className="text-muted-foreground text-sm">No Image Data</div>
                <div className="text-xs text-muted-foreground/50">Prefix: {currentMetadata.prefix || "missing"}</div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full group">
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}

            {/* Viewport Element */}
            <div
                ref={elementRef}
                id={`viewport-${currentMetadata.id}`}
                className="w-full h-full bg-black"
                onContextMenu={(e) => e.preventDefault()}
            />
        </div>
    );
};

export default ViewportComp;
