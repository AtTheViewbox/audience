
import React from 'react';
import { useDragLayer } from 'react-dnd';
import DragComp from './DragComp';

const layerStyles = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 100,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
};

function getItemStyles(initialOffset, currentOffset) {
  if (!initialOffset || !currentOffset) {
    return {
      display: 'none',
    };
  }
  let { x, y } = currentOffset;
  const transform = `translate(${x}px, ${y}px)`;
  return {
    transform,
    WebkitTransform: transform,
  };
}

const CustomDragLayer = (props) => {
  const {
    itemType,
    isDragging,
    item,
    initialOffset,
    currentOffset
  } = useDragLayer((monitor) => ({
    itemType: monitor.getItemType(),
    isDragging: monitor.isDragging(),
    item: monitor.getItem(),
    initialOffset: monitor.getInitialSourceClientOffset(),
    currentOffset: monitor.getSourceClientOffset(),
  }));

  if (!isDragging) {
    return null;
  }

  return (
    <div style={layerStyles}>
      <div style={getItemStyles(initialOffset, currentOffset)}>
          {/* Render the Grid variant (Square) as the preview */}
          {/* We define a fixed size box for the preview to look like the grid item */}
          <div className="w-[150px] h-[150px]"> 
               {/* 
                  Note: DragComp expects full props like metaDataList etc. 
                  For preview, we might just need visual props.
                  But DragComp is tight coupled to list/state logic?
                  Actually, DragComp uses useDrag internally. 
                  Rendering it here might trigger another useDrag which is weird but allowed (as a preview).
                  However, standard practice for previews: Use a dumb component or ensure DragComp handles read-only.
                  
                  Let's replicate the structure or reuse DragComp in a "preview" mode?
                  Since DragComp has useDrag hook, it will try to register drag source.
                  
                  BETTER: Just create a specialized visual here using the item data.
               */}
               <div className="flex w-full h-full items-center justify-center rounded-md border p-2 bg-background/90 shadow-2xl relative overflow-hidden">
                   <div className="text-xs font-medium text-center break-words w-full px-1 line-clamp-3">
                        {item.label || "Untitled"}
                   </div>
               </div>
          </div>
      </div>
    </div>
  );
};

export default CustomDragLayer;
