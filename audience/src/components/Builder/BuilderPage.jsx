
import React, { useState, useEffect } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, Copy, Check } from "lucide-react";

import DragComp from "./DragComp";
import DropComp from "./DropComp";
import PropertyPanel from "./PropertyPanel";
import CustomDragLayer from "./CustomDragLayer";
import { generateGridURL, initalValues } from "./builderUtils";

// NOTE: We need to adapt the seriesList from audience to MetaData format for the builder
const mapSeriesToMetaData = (seriesList) => {
  return seriesList.map((series) => {
      // Use string IDs
      return {
          ...initalValues,
          id: series.id, 
          label: series.name,
          thumbnail: "", 
          modality: series.modality || "CT",
          url: series.url_params || "", 
          cord: [-1, -1] // Default: not placed
      };
  });
};


const BuilderPage = ({ allSeries, filteredSeries }) => {
    // metaDataList Tracks ALL items available in the system + their grid state
    const [metaDataList, setMetaDataList] = useState([]);
    const [metaDataSelected, setMetaDataSelected] = useState(null);
    const [drawerState, setDrawerState] = useState(false); // Kept for API compatibility, though used less now
    
    const [rows, setRows] = useState(1);
    const [cols, setCols] = useState(1);
    
    const [imageToggle, setImageToggle] = useState(false);
    const [url, setURL] = useState("Click Generate URL");
    const [copyClicked, setCopyClicked] = useState(false);

    // Resize State
    const [leftPanelWidth, setLeftPanelWidth] = useState(256);
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [resizeState, setResizeState] = useState(null); // { type: 'left'|'right', startX: number, startWidth: number }


    // Initialize metaDataList from allSeries once
    useEffect(() => {
        if (allSeries && allSeries.length > 0 && metaDataList.length === 0) {
            const mapped = mapSeriesToMetaData(allSeries);
            setMetaDataList(mapped);
        } else if (allSeries && allSeries.length > 0 && metaDataList.length > 0) {
            // Check if new items were added (e.g. upload)
            const newItems = allSeries.filter(s => !metaDataList.find(m => m.id === s.id));
            if (newItems.length > 0) {
                const mappedNew = mapSeriesToMetaData(newItems);
                setMetaDataList(prev => [...prev, ...mappedNew]);
            }
         }
    }, [allSeries]);

    // Resize Handlers
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!resizeState) return;

            if (resizeState.type === 'left') {
                const delta = e.clientX - resizeState.startX;
                const newWidth = Math.min(Math.max(resizeState.startWidth + delta, 150), 500);
                setLeftPanelWidth(newWidth);
            } else if (resizeState.type === 'right') {
                const delta = e.clientX - resizeState.startX;
                // For right panel: moving mouse LEFT (negative delta) should INCREASE width
                // moving mouse RIGHT (positive delta) should DECREASE width
                const newWidth = Math.min(Math.max(resizeState.startWidth - delta, 200), 600);
                setRightPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setResizeState(null);
            document.body.classList.remove("resize-cursor");
            document.body.style.userSelect = ""; // Restore selection
        };

        if (resizeState) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.classList.add("resize-cursor");
            document.body.style.userSelect = "none"; // Prevent text selection
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.classList.remove("resize-cursor");
            document.body.style.userSelect = "";
        };
    }, [resizeState]);


    const addCol = () => {
        if (cols < 3) setCols(cols + 1);
    };
    const minusCol = () => {
        if (cols > 1) setCols(cols - 1);
    };
    const addRow = () => {
        if (rows < 3) setRows(rows + 1);
    };
    const minusRow = () => {
        if (rows > 1) setRows(rows - 1);
    };

    useEffect(() => {
        setURL(generateGridURL(metaDataList, rows, cols));
        setCopyClicked(false);
    }, [metaDataList, rows, cols]);


    return (
        <DndProvider backend={HTML5Backend}>
            <CustomDragLayer />
            <div className="flex h-full w-full overflow-hidden">
                
                {/* LEFT SIDEBAR: Source List */}
                <div 
                    className="flex flex-col border-r bg-background shrink-0 relative"
                    style={{ width: leftPanelWidth }}
                >
                    <div className="p-4 border-b font-semibold">Available Studies</div>
                    <ScrollArea className="flex-1 p-4">
                        <div className="grid grid-cols-1 gap-2">
                             {metaDataList.map((data) => {
                                // 1. Must not be placed in grid
                                const isNotPlaced = data.cord[0] === -1 && data.cord[1] === -1;
                                
                                // 2. Must be in filteredSeries (search results)
                                // filteredSeries might be undefined initially
                                const isVisible = filteredSeries ? filteredSeries.some(s => s.id === data.id) : true;

                                if (isNotPlaced && isVisible) {
                                  return (
                                      <DragComp
                                          key={data.id}
                                          metadata={data}
                                          metaDataList={metaDataList}
                                          setMetaDataList={setMetaDataList}
                                          setMetaDataSelected={setMetaDataSelected}
                                          setDrawerState={setDrawerState}
                                          imageToggle={imageToggle}
                                          variant="list"
                                      />
                                  );
                                }
                                return null;
                             })}
                        </div>
                    </ScrollArea>
                    {/* Resizer Handle */}
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setResizeState({ type: 'left', startX: e.clientX, startWidth: leftPanelWidth });
                        }}
                    />
                </div>

                {/* CENTER: Grid Builder */}
                <div className="flex-1 flex flex-col min-w-0 bg-muted/10 h-full">
                    
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0 z-10">
                            <div className="flex items-center space-x-6">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-muted-foreground mr-2">Grid Layout</span>
                                <div className="flex items-center rounded-md border bg-background shadow-sm">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none border-r" onClick={minusCol} disabled={cols <= 1}>
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <div className="w-12 text-center text-sm font-medium px-2">
                                        {cols} <span className="text-xs text-muted-foreground ml-1">Cols</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none border-l" onClick={addCol} disabled={cols >= 5}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="flex items-center rounded-md border bg-background shadow-sm">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none border-r" onClick={minusRow} disabled={rows <= 1}>
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <div className="w-12 text-center text-sm font-medium px-2">
                                        {rows} <span className="text-xs text-muted-foreground ml-1">Rows</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none border-l" onClick={addRow} disabled={rows >= 5}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            </div>

                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <Switch id="img-toggle" checked={imageToggle} onCheckedChange={setImageToggle} />
                                    <Label htmlFor="img-toggle" className="text-sm cursor-pointer text-muted-foreground">Thumbnails</Label>
                                </div>
                            </div>
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative w-full h-full">
                        {/* Dot Pattern Background */}
                        <div className="absolute inset-0 opacity-[0.4]" 
                            style={{ backgroundImage: 'radial-gradient(circle, #a1a1aa 1px, transparent 1px)', backgroundSize: '24px 24px' }} 
                        />

                        {/* Responsive Grid Container */}
                        <div 
                            className="bg-background rounded-xl border shadow-xl overflow-hidden transition-all duration-300 ease-in-out"
                            style={{ 
                                display: 'grid',
                                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                                gap: '1px',
                                background: '#e4e4e7', // Clean solid grid lines
                                padding: '1px',
                                width: '100%',
                                height: '100%',
                            }}
                        >
                             {Array.from(Array(rows).keys()).map((r) => (
                                Array.from(Array(cols).keys()).map((c) => (
                                    <div key={`${r}-${c}`} className="relative bg-background overflow-hidden">
                                        <DropComp
                                            metaDataList={metaDataList}
                                            r={r}
                                            c={c}
                                            setMetaDataList={setMetaDataList}
                                            setMetaDataSelected={setMetaDataSelected}
                                            setDrawerState={setDrawerState}
                                            imageToggle={imageToggle}
                                        />
                                    </div>
                                ))
                            ))}
                        </div>
                    </div>

                    {/* Footer / URL Bar */}
                    <div className="p-4 border-t bg-background shrink-0 z-10">
                         <div className="max-w-2xl mx-auto flex gap-2 items-center">
                            <div className="relative flex-1">
                                <Input value={url} readOnly className="pr-20 font-mono text-xs text-muted-foreground bg-muted/50" />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground px-2">Generated URL</div>
                            </div>
                            <Button size="icon" variant="secondary" onClick={() => {
                                navigator.clipboard.writeText(url);
                                setCopyClicked(true);
                                setTimeout(() => setCopyClicked(false), 2000);
                            }}>
                                {copyClicked ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                         </div>
                    </div>
                </div>

                {/* RIGHT SIDEBAR: Properties */}
                <div 
                    className={`flex flex-col border-l bg-background shrink-0 relative ${metaDataSelected ? '' : 'hidden'}`}
                    style={{ width: rightPanelWidth }}
                >
                    {/* Resizer Handle */}
                     <div
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setResizeState({ type: 'right', startX: e.clientX, startWidth: rightPanelWidth });
                        }}
                    />
                    
                    <PropertyPanel 
                        metadataId={metaDataSelected} 
                        metaDataList={metaDataList} 
                        setMetaDataList={setMetaDataList}
                        setDrawerState={(state) => {
                            setDrawerState(state);
                            if (!state) setMetaDataSelected(null);
                        }}
                    />
                </div>
            </div>
        </DndProvider>
    );
};

export default BuilderPage;
