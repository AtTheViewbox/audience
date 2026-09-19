
import React, { useRef } from "react";
import { useDrop } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";
import DragComp from "./DragComp";

const DropComp = ({
  metaDataList,
  r,
  c,
  setMetaDataList,
  setMetaDataSelected,
  setDrawerState,
  setRightPanelOpen,
  onDeleteSeries,
  onFilesDropped,
  metaDataSelected,
  propertyEditTick,
}) => {
  const occupied = metaDataList.some((a) => a.cord[0] === c && a.cord[1] === r);
  const lastDropRef = useRef(0);

  const takeDrop = (dataTransfer) => {
    const now = Date.now();
    if (now - lastDropRef.current < 400) return;
    lastDropRef.current = now;
    onFilesDropped?.(dataTransfer, [c, r]);
  };

  const [{ isOver }, drop] = useDrop({
    accept: occupied ? ["card"] : ["card", NativeTypes.FILE],
    drop: (item, monitor) => {
      if (monitor.getItemType() === NativeTypes.FILE) {
        takeDrop({ files: item.files || [], items: [] });
        return;
      }
      addDataToBoard(item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  const addDataToBoard = (item) => {
    if (occupied) return;

    setMetaDataList(
      [...metaDataList].map((object) => {
        if (object.id === item.id) {
          return {
            ...object,
            cord: [c, r],
          };
        } else return object;
      })
    );
  };

  const handleNativeDragOver = (event) => {
    if (occupied || !event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleNativeDrop = (event) => {
    if (occupied || !event.dataTransfer) return;
    const hasFiles = event.dataTransfer.types?.includes("Files") || event.dataTransfer.files?.length;
    if (!hasFiles) return;
    event.preventDefault();
    event.stopPropagation();
    takeDrop(event.dataTransfer);
  };

  return (
    <div
        className={`flex w-full h-full min-h-[100px] items-center justify-center rounded-md border border-dashed transition-colors ${isOver ? "border-primary bg-primary/10" : "border-border"}`}
        ref={drop}
        onDragOver={handleNativeDragOver}
        onDrop={handleNativeDrop}
    >
      {metaDataList.map((data) => {
        if (data.cord[0] === c && data.cord[1] === r) {
          return (
            <DragComp
              key={data.id}
              metadata={data}
              metaDataList={metaDataList}
              setMetaDataList={setMetaDataList}
              setMetaDataSelected={setMetaDataSelected}
              setDrawerState={setDrawerState}
              setRightPanelOpen={setRightPanelOpen}
              onDeleteSeries={onDeleteSeries}
              propertyEditTick={metaDataSelected === data.id ? propertyEditTick : 0}
              variant="grid"
            />
          );
        }
        return null;
      })}
      {!occupied && (
        <div className="pointer-events-none px-3 text-center text-xs text-muted-foreground">
          Drop a series or DICOM folder here
        </div>
      )}
    </div>
  );
};

export default DropComp;
