import React, { useRef, useEffect, useState, useMemo } from "react";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { initalValues, buildLocalStack, clampSliceRange, getIncludedSliceIndices, getImageIdForSlice, stackIndexForSlice } from "./builderUtils";
import { rewriteImageUrl } from "../../../lib/inputParser.ts";
import { ensureR2AccessToken, getR2AccessToken } from "../../../lib/r2Access.js";
import { Loader2 } from "lucide-react";
import { ImageLoaderQueue } from "../../../lib/ImageLoaderQueue.ts";
import { initCornerstone, isMobileDevice } from "../../../lib/initCornerstone.js";

const ViewportComp = ({
    metadata,
    currentMetadata: currentMetadataProp,
    stateFlag,
    setStateFlag,
    onUpdate,
    propertyEditTick = 0,
}) => {
    const elementRef = useRef(null);
    const renderingEngineRef = useRef(null);
    const queueRef = useRef(null);
    const loadedSetRef = useRef(new Set());
    const voiRef = useRef(null);
    const invertRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [r2Token, setR2Token] = useState(() => getR2AccessToken());


    // Unpack metadata safely (DragComp passes currentMetadata; PropertyPanel passes metadata)
    const currentMetadata = metadata || currentMetadataProp || initalValues;

    useEffect(() => {
        if (currentMetadata.localBlobUrls?.length) return;
        ensureR2AccessToken().then((token) => setR2Token(token || null));
    }, [currentMetadata.prefix, currentMetadata.localBlobUrls]);

    const stack = useMemo(() => {
        if (currentMetadata.localBlobUrls?.length) {
            return buildLocalStack(currentMetadata);
        }
        if (!currentMetadata.prefix) return [];
        return getIncludedSliceIndices(currentMetadata)
            .map((index) => {
                const id = getImageIdForSlice(currentMetadata, index);
                return id ? rewriteImageUrl(id) : null;
            })
            .filter(Boolean);
    }, [
        currentMetadata.localBlobUrls,
        currentMetadata.prefix,
        currentMetadata.suffix,
        currentMetadata.start_slice,
        currentMetadata.end_slice,
        currentMetadata.excluded_slices,
        currentMetadata.pad,
        currentMetadata.step,
        currentMetadata.min_slice,
        r2Token,
    ]);

    const viewportId = `preview-vp-${currentMetadata.id}`;
    const renderingEngineId = `preview-engine-${currentMetadata.id}`;
    const includedRef = useRef([]);
    const applyingRangeRef = useRef(false);
    includedRef.current = getIncludedSliceIndices(currentMetadata);

    const updateWindowCamera = () => {
        const renderingEngine = renderingEngineRef.current;
        if (!renderingEngine) return;

        const vp = renderingEngine.getViewport(viewportId);
        if (!vp) return;

        const properties = vp.getProperties();
        const voiRange = properties.voiRange;
        if (!voiRange) return;

        const { windowWidth, windowCenter } = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
        const [x, y] = vp.getPan();
        const zoom = vp.getZoom();

        onUpdate({
            wc: windowCenter,
            ww: windowWidth,
            z: zoom,
            px: x,
            py: y,
        });
    };

    const updateCurrentSlice = () => {
        if (applyingRangeRef.current) return;
        const renderingEngine = renderingEngineRef.current;
        if (!renderingEngine) return;
        const vp = renderingEngine.getViewport(viewportId);
        if (!vp) return;
        const included = includedRef.current;
        const stackIndex = vp.getCurrentImageIdIndex();
        queueRef.current?.updateFocus(stackIndex);
        onUpdate({
            ci: included[stackIndex] ?? included[0],
        });
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
                await initCornerstone();

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
                element.addEventListener(cornerstone.EVENTS.CAMERA_MODIFIED, updateWindowCamera);
                element.addEventListener(cornerstone.EVENTS.VOI_MODIFIED, updateWindowCamera);
                element.addEventListener(cornerstone.EVENTS.STACK_NEW_IMAGE, updateCurrentSlice);

                // 4. Setup Tools
                const {
                    PanTool,
                    WindowLevelTool,
                    StackScrollTool,
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
                    cornerstoneTools.addTool(StackScrollTool);
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
                toolGroup.addTool(StackScrollTool.toolName, { loop: false });

                const { MouseBindings, KeyboardBindings } = csToolsEnums;
                toolGroup.setToolActive(StackScrollTool.toolName, {
                    bindings: [{ mouseButton: MouseBindings.Primary }],
                });
                if (KeyboardBindings?.Shift != null) {
                    toolGroup.setToolActive(WindowLevelTool.toolName, {
                        bindings: [{ mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Shift }],
                    });
                }
                toolGroup.setToolActive(PanTool.toolName, {
                    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
                });
                toolGroup.setToolActive(ZoomTool.toolName, {
                    bindings: [{ mouseButton: MouseBindings.Secondary }],
                });

                toolGroup.addViewport(viewportId, renderingEngineId);

                setIsLoading(true);
                setLoadError(null);

                const relativeSliceIndex = Math.max(
                    0,
                    Math.min(stack.length - 1, stackIndexForSlice(currentMetadata, clampSliceRange(currentMetadata).ci))
                );

                const firstId = stack[relativeSliceIndex] || stack[0];
                await cornerstone.imageLoader.loadAndCacheImage(firstId, {
                    priority: 100,
                    requestType: "interaction",
                });

                if (!renderingEngineRef.current) return;

                await viewport.setStack(stack, relativeSliceIndex);

                const image = cornerstone.cache.getImage(firstId);
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

                viewport.setZoom(currentMetadata.z || 1);
                viewport.setPan([Number(currentMetadata.px || 0), Number(currentMetadata.py || 0)]);

                voiRef.current = cornerstone.utilities.windowLevel.toLowHighRange(currentMetadata.ww, currentMetadata.wc);
                invertRef.current = false;
                viewport.setProperties({
                    voiRange: voiRef.current,
                    invert: false,
                    isComputedVOI: false
                });

                viewport.render();
                if (renderingEngineRef.current) setIsLoading(false);

                loadedSetRef.current = new Set([relativeSliceIndex]);
                const sliceIsReady = (index) => {
                    const id = stack[index];
                    if (id == null || !loadedSetRef.current.has(index)) return false;
                    try {
                        return Boolean(cornerstone.cache.isLoaded(id));
                    } catch {
                        return false;
                    }
                };
                const applyDesiredVoi = () => {
                    if (!voiRef.current) return;
                    viewport.setProperties({
                        voiRange: voiRef.current,
                        invert: invertRef.current,
                        isComputedVOI: false,
                    });
                };

                if (queueRef.current) queueRef.current.destroy();
                const queue = new ImageLoaderQueue(
                    stack,
                    6,
                    (loadedIndex) => {
                        loadedSetRef.current.add(loadedIndex);
                    },
                    () => {},
                    isMobileDevice()
                );
                queue.markAsLoaded(relativeSliceIndex);
                queue.updateFocus(relativeSliceIndex);
                queue.start();
                queueRef.current = queue;

                let gating = false;
                const origSetImageIdIndex = viewport.setImageIdIndex.bind(viewport);
                viewport.setImageIdIndex = async (index) => {
                    if (gating) {
                        if (!sliceIsReady(index)) return viewport.getCurrentImageIdIndex();
                        return origSetImageIdIndex(index);
                    }
                    gating = true;
                    let target = index;
                    if (!sliceIsReady(index)) {
                        const prev = viewport.getCurrentImageIdIndex();
                        const dir = index >= prev ? 1 : -1;
                        let nearest = -1;
                        for (let i = prev + dir; i >= 0 && i < stack.length; i += dir) {
                            if (sliceIsReady(i)) { nearest = i; break; }
                        }
                        target = nearest === -1 ? prev : nearest;
                    }
                    try {
                        const result = await origSetImageIdIndex(target);
                        applyDesiredVoi();
                        viewport.render();
                        queueRef.current?.updateFocus(target);
                        return result;
                    } finally {
                        gating = false;
                    }
                };

                const handleWheel = (event) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const delta = event.deltaY > 0 ? 1 : -1;
                    const current = viewport.getCurrentImageIdIndex();
                    for (let i = current + delta; i >= 0 && i < stack.length; i += delta) {
                        if (sliceIsReady(i)) {
                            viewport.setImageIdIndex(i);
                            break;
                        }
                    }
                };
                let correctingVoi = false;
                const handleImageRendered = () => {
                    if (correctingVoi || !voiRef.current) return;
                    const props = viewport.getProperties();
                    if (Boolean(props.invert) === Boolean(invertRef.current) && props.isComputedVOI !== true) return;
                    correctingVoi = true;
                    applyDesiredVoi();
                    viewport.render();
                    correctingVoi = false;
                };
                const captureUserVoi = () => {
                    const props = viewport.getProperties();
                    if (props.voiRange && props.isComputedVOI !== true) {
                        voiRef.current = props.voiRange;
                        invertRef.current = props.invert ?? false;
                    }
                };

                element.addEventListener("wheel", handleWheel, { capture: true, passive: false });
                element.addEventListener("mouseup", captureUserVoi);
                element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, handleImageRendered);
                element._atvbScrollCleanup = () => {
                    viewport.setImageIdIndex = origSetImageIdIndex;
                    element.removeEventListener("wheel", handleWheel, true);
                    element.removeEventListener("mouseup", captureUserVoi);
                    element.removeEventListener(cornerstone.EVENTS.IMAGE_RENDERED, handleImageRendered);
                };
            } catch (err) {
                console.error("Viewport Setup Error", err);
                setLoadError(err?.message || "Failed to load images");
            }
        };

        setupViewport();

        // Cleanup
        return () => {
            if (queueRef.current) {
                queueRef.current.destroy();
                queueRef.current = null;
            }

            const { ToolGroupManager } = cornerstoneTools;
            if (ToolGroupManager.getToolGroup(toolGroupId)) {
                ToolGroupManager.destroyToolGroup(toolGroupId);
            }

            if (renderingEngineRef.current) {
                renderingEngineRef.current.destroy();
                renderingEngineRef.current = null;
            }

            if (element) {
                element._atvbScrollCleanup?.();
                delete element._atvbScrollCleanup;
                element.removeEventListener(cornerstone.EVENTS.CAMERA_MODIFIED, updateWindowCamera);
                element.removeEventListener(cornerstone.EVENTS.VOI_MODIFIED, updateWindowCamera);
                element.removeEventListener(cornerstone.EVENTS.STACK_NEW_IMAGE, updateCurrentSlice);
            }
        };
    }, []); // Mount only once

    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        let frame = 0;
        const lastSize = { w: 0, h: 0 };

        const fitToCell = () => {
            const engine = renderingEngineRef.current;
            if (!engine) return;
            const viewport = engine.getViewport(viewportId);
            if (!viewport) return;

            const w = element.clientWidth;
            const h = element.clientHeight;
            if (w < 4 || h < 4) return;
            if (Math.abs(w - lastSize.w) < 2 && Math.abs(h - lastSize.h) < 2) return;
            lastSize.w = w;
            lastSize.h = h;

            try {
                applyingRangeRef.current = true;
                engine.resize(true, false);
                viewport.render();
                const [x, y] = viewport.getPan();
                onUpdateRef.current?.({
                    z: viewport.getZoom(),
                    px: x,
                    py: y,
                });
            } catch (err) {
                console.warn("[ViewportComp] resize failed", err);
            } finally {
                requestAnimationFrame(() => {
                    applyingRangeRef.current = false;
                });
            }
        };

        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fitToCell);
        });
        observer.observe(element);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [viewportId]);

    const lastPropertyEditRef = useRef(0);
    const lastRangeKeyRef = useRef("");

    // React to property-panel edits for the grid viewport
    useEffect(() => {
        const update = async () => {
            const renderingEngine = renderingEngineRef.current;
            if (!renderingEngine) return;
            const viewport = renderingEngine.getViewport(viewportId);
            if (!viewport) return;

            const { start_slice, end_slice, ci, excluded_slices } = clampSliceRange(currentMetadata);
            const rangeKey = `${start_slice}:${end_slice}:${stack.length}:${(excluded_slices || []).join(",")}`;
            const rangeChanged = lastRangeKeyRef.current !== rangeKey;
            const shouldSyncFromPanel = stateFlag || propertyEditTick > lastPropertyEditRef.current || rangeChanged;
            if (!shouldSyncFromPanel) return;
            lastPropertyEditRef.current = propertyEditTick;
            lastRangeKeyRef.current = rangeKey;

            const relativeSliceIndex = Math.max(0, Math.min(stack.length - 1, stackIndexForSlice(currentMetadata, ci)));

            applyingRangeRef.current = true;
            try {
                await viewport.setStack(stack, relativeSliceIndex);
                if (viewport.getCurrentImageIdIndex() !== relativeSliceIndex) {
                    viewport.setImageIdIndex(relativeSliceIndex);
                }
            } catch (err) {
                applyingRangeRef.current = false;
                throw err;
            }

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
                invert: invertRef.current,
                isComputedVOI: false
            });
            voiRef.current = cornerstone.utilities.windowLevel.toLowHighRange(currentMetadata.ww, currentMetadata.wc);

            viewport.render();
            requestAnimationFrame(() => {
                applyingRangeRef.current = false;
            });
            if (stateFlag && setStateFlag) setStateFlag(false);
        };
        update();
    }, [currentMetadata, stateFlag, stack, propertyEditTick]);

    useEffect(() => {
        if (applyingRangeRef.current) return;
        const viewport = renderingEngineRef.current?.getViewport(viewportId);
        if (!viewport || !stack.length) return;
        const { ci } = clampSliceRange(currentMetadata);
        const idx = Math.max(0, Math.min(stack.length - 1, stackIndexForSlice(currentMetadata, ci)));
        if (viewport.getCurrentImageIdIndex() !== idx) {
            applyingRangeRef.current = true;
            viewport.setImageIdIndex(idx);
            viewport.render();
            requestAnimationFrame(() => {
                applyingRangeRef.current = false;
            });
        }
    }, [currentMetadata.ci, stack.length, viewportId]);

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
                <div className="text-xs text-muted-foreground/50">
                    {currentMetadata.isDraft
                        ? "Local draft — adjust slices or save to upload"
                        : `Prefix: ${currentMetadata.prefix || "missing"}`}
                </div>
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
