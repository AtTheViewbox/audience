import React, { useEffect, useRef } from "react";
import { useDrag } from "react-dnd";
import { X, Pencil, GripVertical, Trash2 } from "lucide-react";
import { getEmptyImage } from "react-dnd-html5-backend";
import ViewportComp from "./ViewportComp";
import SliceFilmstrip from "./SliceFilmstrip";
import { clampSliceRange } from "./builderUtils";

const DragComp = ({
    metadata,
    metaDataList,
    setMetaDataList,
    setMetaDataSelected,
    setDrawerState,
    setRightPanelOpen,
    onDeleteSeries,
    propertyEditTick = 0,
    variant = "grid" // "grid" | "list"
}) => {
    const [{ isDragging }, drag, preview] = useDrag(() => ({
        type: "card",
        item: { id: metadata.id, label: metadata.label, type: "card" },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    useEffect(() => {
        // Use empty image as drag preview so the browser doesn't draw the element
        // We will draw a custom drag layer instead
        preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    const toggleDrawer = (data) => {
        setMetaDataSelected(data.id);
        setDrawerState(true);
        setRightPanelOpen?.(true);
    };

    const resetPosition = (e) => {
        e.stopPropagation();
        setMetaDataList(
            [...metaDataList].map((object) => {
                if (object.id === metadata.id) {
                    return {
                        ...object,
                        cord: [-1, -1],
                    };
                } else return object;
            })
        );
    };

    if (variant === "list") {
        return (
            <div 
                className="flex w-full items-center gap-3 rounded-md border p-3 hover:bg-accent/50 transition-colors bg-background relative shadow-sm cursor-grab active:cursor-grabbing" 
                ref={drag}
                style={{ opacity: isDragging ? 0.3 : 1 }}
            >
                <GripVertical size={16} className="text-muted-foreground shrink-0" />
                
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={metadata.label}>
                        {metadata.label || "Untitled"}
                    </div>
                    {metadata.isDraft && (
                        <div className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold mt-0.5">
                            Local draft
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                     <Pencil 
                        onClick={(e) => { e.stopPropagation(); toggleDrawer(metadata); }} 
                        className="hover:bg-accent rounded-sm cursor-pointer text-muted-foreground hover:text-foreground h-4 w-4" 
                    />
                    {(metadata.isDraft || metadata.folder_name) && (
                        <Trash2
                            onClick={(e) => { e.stopPropagation(); onDeleteSeries?.(metadata); }}
                            className="hover:bg-destructive/10 rounded-sm cursor-pointer text-muted-foreground hover:text-destructive h-4 w-4"
                        />
                    )}
                </div>
            </div>
        );
    }

    const dragHandleRef = drag;
    const viewportCaptureRef = useRef(null);

    // Grid cells always show the live viewport so edits use the full canvas area.
    return (
        <div
            className="flex w-full h-full items-center justify-center rounded-md relative shadow-sm overflow-hidden group"
            style={{ opacity: isDragging ? 0.3 : 1 }}
        >
            <div className={`absolute top-1 right-1 flex gap-1 z-20 transition-opacity opacity-0 group-hover:opacity-100`}>
                {metadata.cord.toString() !== "-1,-1" && (
                     <div className="bg-background/80 rounded-sm p-1 hover:bg-accent cursor-pointer border" onClick={resetPosition} title="Remove from grid">
                        <X size={14} className="text-muted-foreground"/>
                     </div>
                )}
                 <div className="bg-background/80 rounded-sm p-1 hover:bg-accent cursor-pointer border" onClick={(e) => { e.stopPropagation(); toggleDrawer(metadata); }} title="Edit properties">
                    <Pencil size={14} className="text-muted-foreground"/>
                 </div>
                {(metadata.isDraft || metadata.folder_name) && (
                    <div
                        className="bg-background/80 rounded-sm p-1 hover:bg-destructive/10 cursor-pointer border"
                        onClick={(e) => { e.stopPropagation(); onDeleteSeries?.(metadata); }}
                        title={metadata.isDraft ? "Delete upload" : "Delete series and Cloudflare files"}
                    >
                        <Trash2 size={14} className="text-muted-foreground"/>
                    </div>
                )}
            </div>

            <div className="w-full h-full bg-black overflow-hidden relative flex flex-col">
                <div className="flex-1 relative overflow-hidden min-h-0">
                    <div ref={viewportCaptureRef} className="absolute inset-0">
                        <ViewportComp
                            metadata={metadata}
                            propertyEditTick={propertyEditTick}
                            onUpdate={(updates) => {
                                setMetaDataList(prev => prev.map(item => {
                                    if (item.id === metadata.id) {
                                        return { ...item, ...updates };
                                    }
                                    return item;
                                }));
                            }}
                            key={metadata.id}
                        />
                    </div>
                    <div
                        ref={dragHandleRef}
                        className="absolute top-0 left-0 w-8 h-8 z-50 cursor-grab active:cursor-grabbing hover:bg-white/10 rounded-br-md transition-colors"
                        title="Drag to move"
                    />
                </div>
                <div
                    className="shrink-0 border-t border-border bg-background px-2 pt-2 pb-1.5"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <SliceFilmstrip
                        metadata={metadata}
                        captureRootRef={viewportCaptureRef}
                        onChange={(range) => {
                            setMetaDataList((prev) =>
                                prev.map((item) =>
                                    item.id === metadata.id
                                        ? { ...item, ...clampSliceRange({ ...item, ...range }) }
                                        : item
                                )
                            );
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default DragComp;
