import React, { useEffect } from "react";
import { useDrag } from "react-dnd";
import { X, Pencil, GripVertical } from "lucide-react";
import { getEmptyImage } from "react-dnd-html5-backend";
import ViewportComp from "./ViewportComp";

const DragComp = ({
    metadata,
    metaDataList,
    setMetaDataList,
    setMetaDataSelected,
    setDrawerState,
    imageToggle,
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
                </div>

                <div className="flex items-center gap-1 shrink-0">
                     <Pencil 
                        onClick={() => toggleDrawer(metadata)} 
                        className="hover:bg-accent rounded-sm cursor-pointer text-muted-foreground hover:text-foreground h-4 w-4" 
                    />
                </div>
            </div>
        );
    }

    // Conditional ref assignment:
    // In Preview Mode: Attach 'drag' to the handle only.
    // In Normal Mode: Attach 'drag' to the main container.
    const containerRef = (node) => {
        if (!imageToggle) drag(node);
    };
    
    const handleRef = (node) => {
        if (imageToggle) drag(node);
    };

    // Default GRID Layout (Square)
    return (
        <div 
            className={`flex w-full h-full items-center justify-center rounded-md relative shadow-sm overflow-hidden group ${imageToggle ? '' : 'border p-2 bg-background cursor-grab active:cursor-grabbing'}`} 
            ref={containerRef}
            style={{ opacity: isDragging ? 0.3 : 1 }}
        >
            {/* Controls overlay on hover */}
            <div className={`absolute top-1 right-1 flex gap-1 z-20 transition-opacity ${imageToggle ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {metadata.cord.toString() !== "-1,-1" && (
                     <div className="bg-background/80 rounded-sm p-1 hover:bg-accent cursor-pointer border" onClick={resetPosition}>
                        <X size={14} className="text-muted-foreground"/>
                     </div>
                )}
                 <div className="bg-background/80 rounded-sm p-1 hover:bg-accent cursor-pointer border" onClick={(e) => { e.stopPropagation(); toggleDrawer(metadata); }}>
                    <Pencil size={14} className="text-muted-foreground"/>
                 </div>
            </div>

            {imageToggle ? (
                <div className="w-full h-full bg-background overflow-hidden relative flex flex-col">
                    <div className="flex-1 relative overflow-hidden">
                        <ViewportComp 
                            viewportIndex={`preview-${metadata.id}`}
                            currentMetadata={metadata}
                            onUpdate={(updates) => {
                                 setMetaDataList(prev => prev.map(item => {
                                     if (item.id === metadata.id) {
                                         return { ...item, ...updates };
                                     }
                                     return item;
                                 }));
                            }}
                        />
                         {/* Invisible Drag Handle (Top-Left Corner) */}
                        <div 
                            ref={handleRef}
                            className="absolute top-0 left-0 w-8 h-8 z-50 cursor-grab active:cursor-grabbing hover:bg-white/10 rounded-br-md transition-colors"
                            title="Drag to move"
                        />
                    </div>
                </div> 
            ) : (
                <div className="text-sm font-medium text-center break-words w-full px-1 line-clamp-3">
                    {metadata.label || "Untitled"}
                </div>
            )}
        </div>
    );
};

export default DragComp;
