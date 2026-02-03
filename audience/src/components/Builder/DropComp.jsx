
import React from "react";
import { useDrop } from "react-dnd";
import DragComp from "./DragComp";

const DropComp = ({
  metaDataList,
  r,
  c,
  setMetaDataList,
  setMetaDataSelected,
  setDrawerState,
  imageToggle
}) => {
  const [{ isOver }, drop] = useDrop({
    accept: "card",
    drop: (item) => {
      addDataToBoard(item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  });

  const addDataToBoard = (item) => {
    // Check if cell is already occupied
    if (
      metaDataList.some((a) => a.cord[0] === c && a.cord[1] === r)
    ) {
      return;
    }

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

  return (
    <div 
        className={`flex w-full h-full min-h-[100px] items-center justify-center rounded-md border border-dashed transition-colors p-2 ${isOver ? 'border-primary bg-primary/10' : 'border-border'}`} 
        ref={drop}
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
              imageToggle={imageToggle}
              variant="grid"
            />
          );
        }
        return null; // Return null if not matching to avoid warning
      })}
    </div>
  );
};

export default DropComp;
