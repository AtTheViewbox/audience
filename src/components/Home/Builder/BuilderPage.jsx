import React, { useState, useEffect, useContext } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Minus, Copy, Check, Loader2, X, PanelRightOpen, ShieldCheck } from "lucide-react";

import DragComp from "./DragComp";
import DropComp from "./DropComp";
import PropertyPanel from "./PropertyPanel";
import CustomDragLayer from "./CustomDragLayer";
import { generateGridURL, initalValues, hasDraftPlacedOnGrid, isPlacedOnGrid, findFirstEmptyCell, clampSliceRange } from "./builderUtils";

import { UserContext } from "../../../context/UserContext"
import { UploaderComp } from "../UploaderComp"
import { uploadDraftSeries, revokeDraftBlobUrls, deleteCloudSeries, countStudiesUsingFolder, extractUploadFolderName, collectDicomFilesFromDataTransfer, groupDicomFilesByFolder, prepareLocalDraftSeries } from "../../../lib/dicomUploadUtils"
import { toast } from "sonner";
import { initCornerstone } from "../../../lib/initCornerstone.js";

// We need to export this or move map logic to ensure it's available if needed, but for now we keep it here.
const mapSeriesToMetaData = (seriesList) => {
    // ... existing implementation ...
    return seriesList.map((series) => {
        // Prioritize existing metadata structure
        if (series.metadata) {
            const withSlices = {
                ...initalValues,
                ...series.metadata,
                id: series.id,
                label: series.name || series.folder_name || series.metadata.label || "Untitled",
                folder_name: series.folder_name || extractUploadFolderName(series.prefix || series.metadata.prefix),
                prefix: series.prefix || series.metadata.prefix || "",
                suffix: series.suffix || series.metadata.suffix || "",
                start_slice: series.start_slice ?? series.metadata.start_slice ?? 0,
                end_slice: series.end_slice ?? series.metadata.end_slice ?? 1,
                min_slice: series.min_slice ?? series.metadata.min_slice ?? 0,
                max_slice: series.max_slice ?? series.metadata.max_slice ?? 0,
                cord: [-1, -1],
            };
            return { ...withSlices, ...clampSliceRange(withSlices) };
        }

        // Fallback for raw series without pre-calculated metadata
        return {
            ...initalValues,
            id: series.id,
            label: series.name || "Untitled",
            modality: series.modality || "CT",
            folder_name: series.folder_name || extractUploadFolderName(series.prefix),
            prefix: series.prefix || "",
            cord: [-1, -1]
        };
    });
};


const BuilderPage = ({ allSeries, filteredSeries, onStudySaved }) => {
    // metaDataList Tracks ALL items available in the system + their grid state
    const [metaDataList, setMetaDataList] = useState([]);
    const [metaDataSelected, setMetaDataSelected] = useState(null);
    const [drawerState, setDrawerState] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);

    // User Context for saving
    const { supabaseClient, userData } = useContext(UserContext).data; // accessing .data based on usage in other files

    const [rows, setRows] = useState(1);
    const [cols, setCols] = useState(1);

    const [savedUrl, setSavedUrl] = useState(null); // share link shown only after upload
    const [copyClicked, setCopyClicked] = useState(false);

    // Save Form State
    const [saveForm, setSaveForm] = useState({
        name: "",
        description: "",
        visibility: "PUBLIC"
    });

    const [isSaving, setIsSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [propertyEditTick, setPropertyEditTick] = useState(0);
    const [phiVerified, setPhiVerified] = useState(false);

    useEffect(() => {
        initCornerstone();
    }, []);

    const handleLocalSeriesReady = (draftSeries) => {
        const requested = Array.isArray(draftSeries.cord) ? draftSeries.cord : [-1, -1];
        let nextCols = cols;
        let nextRows = rows;

        if (requested[0] >= 0 && requested[1] >= 0) {
            nextCols = Math.max(nextCols, requested[0] + 1);
            nextRows = Math.max(nextRows, requested[1] + 1);
        }

        let slot = requested[0] >= 0 && requested[1] >= 0
            ? requested
            : findFirstEmptyCell(metaDataList, nextCols, nextRows);

        while (!slot && (nextCols < 5 || nextRows < 5)) {
            if (nextCols <= nextRows && nextCols < 5) nextCols += 1;
            else if (nextRows < 5) nextRows += 1;
            else break;
            slot = findFirstEmptyCell(metaDataList, nextCols, nextRows);
        }

        if (nextCols !== cols) setCols(nextCols);
        if (nextRows !== rows) setRows(nextRows);

        const placedDraft = { ...draftSeries, cord: slot || [-1, -1] };

        setMetaDataList((prev) => [...prev, placedDraft]);
        setMetaDataSelected(placedDraft.id);
        setDrawerState(true);
        setRightPanelOpen(true);

        const defaultName = placedDraft.label || "New Uploaded Study";
        const defaultDescription = placedDraft.studyName && placedDraft.studyName !== defaultName
            ? placedDraft.studyName
            : "";
        setSaveForm((prev) => ({
            ...prev,
            name: prev.name || defaultName,
            description: prev.description || defaultDescription,
        }));
    };

    const growGridToFit = (needed) => {
        let nextCols = cols;
        let nextRows = rows;
        while (nextCols * nextRows < needed && (nextCols < 5 || nextRows < 5)) {
            if (nextCols <= nextRows && nextCols < 5) nextCols += 1;
            else if (nextRows < 5) nextRows += 1;
            else break;
        }
        if (nextCols !== cols) setCols(nextCols);
        if (nextRows !== rows) setRows(nextRows);
        return { cols: nextCols, rows: nextRows };
    };

    const handleGridFileDrop = async (dataTransfer, slot) => {
        const files = await collectDicomFilesFromDataTransfer(dataTransfer);
        if (!files.length) {
            toast.error("No DICOM files in that drop");
            return;
        }
        const groups = groupDicomFilesByFolder(files).filter((group) => group.length);
        const placedCount = metaDataList.filter(isPlacedOnGrid).length;
        const grid = growGridToFit(placedCount + groups.length);
        let occupied = metaDataList.filter(isPlacedOnGrid).map((item) => `${item.cord[0]},${item.cord[1]}`);
        const nextSlot = () => {
            if (slot && !occupied.includes(`${slot[0]},${slot[1]}`)) {
                occupied.push(`${slot[0]},${slot[1]}`);
                return slot;
            }
            for (let r = 0; r < grid.rows; r++) {
                for (let c = 0; c < grid.cols; c++) {
                    const key = `${c},${r}`;
                    if (!occupied.includes(key)) {
                        occupied.push(key);
                        return [c, r];
                    }
                }
            }
            return [-1, -1];
        };

        try {
            for (let i = 0; i < groups.length; i++) {
                toast.loading(`Preparing DICOM… ${i + 1}/${groups.length}`, {
                    id: "dicom-prep",
                    duration: Infinity,
                });
                const draft = await prepareLocalDraftSeries(groups[i], "", () => {});
                handleLocalSeriesReady({ ...draft, cord: nextSlot() });
            }
            toast.success(
                groups.length > 1 ? `${groups.length} series loaded into Builder` : "DICOM loaded into Builder",
                { id: "dicom-prep", duration: 1500 }
            );
        } catch (error) {
            console.error(error);
            toast.error("Failed to load dropped DICOM files", { id: "dicom-prep" });
        }
    };

    const handleDeleteSeries = async (series) => {
        if (series?.isDraft) {
            if (!window.confirm(`Remove “${series.label || "this upload"}” from the builder?`)) return;
            revokeDraftBlobUrls(series);
            setMetaDataList((prev) => prev.filter((item) => item.id !== series.id));
            if (metaDataSelected === series.id) {
                setMetaDataSelected(null);
                setDrawerState(false);
            }
            toast.success("Upload removed");
            return;
        }

        const folderName = series?.folder_name || extractUploadFolderName(series?.prefix);
        if (!folderName && !series?.id) return;

        let usedBy = 0;
        try {
            usedBy = folderName ? await countStudiesUsingFolder(supabaseClient, folderName) : 0;
        } catch (error) {
            console.error(error);
        }

        const usageNote = usedBy
            ? ` ${usedBy} saved case${usedBy === 1 ? "" : "s"} still point at these images and will break.`
            : "";
        if (!window.confirm(`Delete “${series.label || "this series"}” and its Cloudflare files?${usageNote}`)) return;

        try {
            await deleteCloudSeries(supabaseClient, { ...series, folder_name: folderName });
            setMetaDataList((prev) => prev.filter((item) => item.id !== series.id));
            if (metaDataSelected === series.id) {
                setMetaDataSelected(null);
                setDrawerState(false);
            }
            toast.success("Series and Cloudflare files deleted");
            onStudySaved?.();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || "Failed to delete series");
        }
    };

    const closeRightPanel = () => {
        setRightPanelOpen(false);
        setDrawerState(false);
        setMetaDataSelected(null);
    };

    const reportUploadProgress = (percent, label = "Uploading images") => {
        setUploadProgress(percent);
        if (percent <= 0) return;
        toast.loading(`${label}… ${Math.round(percent)}%`, {
            id: "builder-upload",
            duration: Infinity,
        });
    };

    const handleSaveCase = async () => {
        if (!userData?.id) {
            toast.error("Missing user session");
            return;
        }

        if (!saveForm.name.trim()) {
            toast.error("Enter a name for this case");
            return;
        }

        const placedItems = metaDataList.filter(isPlacedOnGrid);
        if (placedItems.some((item) => item.isDraft) && !phiVerified) {
            toast.error("Confirm the images are de-identified before uploading");
            return;
        }
        if (placedItems.length === 0) {
            toast.error("Drag at least one series onto the grid before saving");
            return;
        }

        if (isSaving) return;
        setIsSaving(true);
        setUploadProgress(null);

        const caseName = saveForm.name.trim();
        const caseDescription = saveForm.description;
        const caseVisibility = saveForm.visibility;
        const draftsToUpload = placedItems.filter((item) => item.isDraft);

        try {
            let workingList = [...metaDataList];

            for (let i = 0; i < draftsToUpload.length; i++) {
                const draft = draftsToUpload[i];
                const label = draftsToUpload.length > 1
                    ? `Uploading ${i + 1}/${draftsToUpload.length}`
                    : `Uploading ${draft.label || "series"}`;
                reportUploadProgress(0, label);
                const uploaded = await uploadDraftSeries(
                    workingList.find((item) => item.id === draft.id) || draft,
                    supabaseClient,
                    userData.id,
                    draft.label,
                    (pct) => reportUploadProgress(pct, label)
                );
                workingList = workingList.map((item) =>
                    item.id === draft.id ? uploaded : item
                );
            }

            setMetaDataList(workingList);
            const finalUrl = generateGridURL(workingList, rows, cols);
            setSavedUrl(finalUrl);

            const parsedUrl = new URL(finalUrl);
            const searchParams = parsedUrl.search.substring(1);

            const { error } = await supabaseClient
                .from("studies")
                .insert({
                    owner: userData.id,
                    name: caseName,
                    description: caseDescription,
                    url_params: searchParams,
                    visibility: caseVisibility,
                });

            if (error) throw error;

            toast.success("Study saved and uploaded successfully!", { id: "builder-upload" });
            if (onStudySaved) onStudySaved();

            setSaveForm({
                name: "",
                description: "",
                visibility: "PUBLIC",
            });
            setPhiVerified(false);

            setMetaDataList((prev) => prev.map((item) => ({ ...item, cord: [-1, -1] })));
        } catch (error) {
            console.error("Error saving case:", error);
            toast.error("Failed to save study", { id: "builder-upload" });
        } finally {
            setIsSaving(false);
            setUploadProgress(null);
        }
    };


    // Resize State
    const [leftPanelWidth, setLeftPanelWidth] = useState(256);
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [resizeState, setResizeState] = useState(null);

    // ... (UseEffects for metaDataList init and resize handlers remain the same) ...
    // Note: I will just retain them in the full file rewrite/replace logic below.

    // Keep cloud series in sync with the library, but preserve drafts and grid placement.
    useEffect(() => {
        setMetaDataList((prev) => {
            const drafts = prev.filter((item) => item.isDraft);
            const existingById = new Map(prev.map((item) => [item.id, item]));
            const mapped = mapSeriesToMetaData(allSeries || []).map((item) => {
                const existing = existingById.get(item.id);
                return existing ? { ...item, cord: existing.cord } : item;
            });
            return [...mapped, ...drafts];
        });
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
                const newWidth = Math.min(Math.max(resizeState.startWidth - delta, 200), 600);
                setRightPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setResizeState(null);
            document.body.classList.remove("resize-cursor");
            document.body.style.userSelect = "";
        };

        if (resizeState) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.classList.add("resize-cursor");
            document.body.style.userSelect = "none";
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.classList.remove("resize-cursor");
            document.body.style.userSelect = "";
        };
    }, [resizeState]);


    const addCol = () => { if (cols < 3) setCols(cols + 1); };
    const minusCol = () => { if (cols > 1) setCols(cols - 1); };
    const addRow = () => { if (rows < 3) setRows(rows + 1); };
    const minusRow = () => { if (rows > 1) setRows(rows - 1); };

    const placedItems = metaDataList.filter(isPlacedOnGrid);
    const hasLeftoverDrafts = metaDataList.some((item) => item.isDraft);
    const hasUploadDrafts = placedItems.some((item) => item.isDraft);
    const saveLabel = hasUploadDrafts ? "Save & Upload Case" : "Save Combined Case";
    const saveTitle = hasUploadDrafts ? "Save Case" : "Combine Series";

    useEffect(() => {
        if (hasDraftPlacedOnGrid(metaDataList)) {
            setSavedUrl(null);
        }
    }, [metaDataList]);


    return (
        <DndProvider backend={HTML5Backend}>
            <CustomDragLayer />
            <div className="flex h-full w-full overflow-hidden">

                {/* LEFT SIDEBAR: Source List */}
                <div
                    className="flex flex-col border-r bg-background shrink-0 relative"
                    style={{ width: leftPanelWidth }}
                >
                    {/* ... Same Left Sidebar Content ... */}
                    <div className="p-4 border-b font-semibold flex items-center justify-between gap-2">
                        <span>Available Studies</span>
                        {!userData?.is_anonymous && (
                            <UploaderComp onLocalSeriesReady={handleLocalSeriesReady} />
                        )}
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <div className="grid grid-cols-1 gap-2">
                            {metaDataList.map((data) => {
                                const isNotPlaced = data.cord[0] === -1 && data.cord[1] === -1;
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
                                            setRightPanelOpen={setRightPanelOpen}
                                            onDeleteSeries={handleDeleteSeries}
                                            variant="list"
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </ScrollArea>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setResizeState({ type: 'left', startX: e.clientX, startWidth: leftPanelWidth });
                        }}
                    />
                </div>

                {/* CENTER: Grid Builder - Same as before */}
                <div className="flex-1 flex flex-col min-w-0 bg-muted/10 h-full">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0 z-10">
                        <div className="flex items-center space-x-6">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-muted-foreground mr-2">Grid Layout</span>
                                <div className="flex items-center rounded-md border bg-background shadow-sm">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none border-r" onClick={minusCol} disabled={cols <= 1}><Minus className="h-3 w-3" /></Button>
                                    <div className="w-12 text-center text-sm font-medium px-2">{cols} <span className="text-xs text-muted-foreground ml-1">Cols</span></div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none border-l" onClick={addCol} disabled={cols >= 5}><Plus className="h-3 w-3" /></Button>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="flex items-center rounded-md border bg-background shadow-sm">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none border-r" onClick={minusRow} disabled={rows <= 1}><Minus className="h-3 w-3" /></Button>
                                    <div className="w-12 text-center text-sm font-medium px-2">{rows} <span className="text-xs text-muted-foreground ml-1">Rows</span></div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none border-l" onClick={addRow} disabled={rows >= 5}><Plus className="h-3 w-3" /></Button>
                                </div>
                            </div>
                        </div>
                        {!rightPanelOpen && (
                            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setRightPanelOpen(true)}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {uploadProgress != null ? `Uploading ${uploadProgress}%` : "Saving…"}
                                    </>
                                ) : (
                                    <>
                                        <PanelRightOpen className="h-4 w-4" />
                                        {saveTitle}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>

                    {/* Canvas Area */}
                    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative w-full h-full">
                        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(circle, #a1a1aa 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                        <div
                            className="bg-background rounded-xl border shadow-xl overflow-hidden transition-all duration-300 ease-in-out"
                            style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: '1px', background: '#e4e4e7', padding: '1px', width: '100%', height: '100%' }}
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
                                            metaDataSelected={metaDataSelected}
                                            propertyEditTick={propertyEditTick}
                                            setRightPanelOpen={setRightPanelOpen}
                                            onDeleteSeries={handleDeleteSeries}
                                            onFilesDropped={handleGridFileDrop}
                                        />
                                    </div>
                                ))
                            ))}
                        </div>
                    </div>

                    {savedUrl && (
                    <div className="p-4 border-t bg-background shrink-0 z-10">
                        <div className="max-w-2xl mx-auto flex gap-2 items-center">
                            <div className="relative flex-1">
                                <Input value={savedUrl} readOnly className="pr-20 font-mono text-xs text-muted-foreground bg-muted/50" />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground px-2">Share URL</div>
                            </div>
                            <Button size="icon" variant="secondary" onClick={() => {
                                navigator.clipboard.writeText(savedUrl);
                                setCopyClicked(true);
                                setTimeout(() => setCopyClicked(false), 2000);
                            }}>
                                {copyClicked ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                    )}
                </div>

                {rightPanelOpen && (
                <div
                    className={`flex flex-col border-l bg-background shrink-0 relative`}
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

                    <div className="flex flex-col h-full min-h-0">
                        <div className="p-4 border-b font-semibold shrink-0 flex items-center justify-between gap-2">
                            <span>{saveTitle}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeRightPanel} title="Close panel">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-6">
                                <div className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="upload-name">Name</Label>
                                        <Input
                                            id="upload-name"
                                            value={saveForm.name}
                                            onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })}
                                            placeholder="Filled from the DICOM series name"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="upload-desc">Description</Label>
                                        <Input
                                            id="upload-desc"
                                            value={saveForm.description}
                                            onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })}
                                            placeholder="Filled from the DICOM study description"
                                        />
                                    </div>
                                </div>

                                <Separator />

                                {metaDataSelected ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-sm font-semibold">Edit Properties</h4>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => {
                                                    setDrawerState(false);
                                                    setMetaDataSelected(null);
                                                }}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <PropertyPanel
                                            embedded
                                            metadataId={metaDataSelected}
                                            metaDataList={metaDataList}
                                            setMetaDataList={setMetaDataList}
                                            onPropertyEdit={() => setPropertyEditTick((n) => n + 1)}
                                            setDrawerState={(state) => {
                                                setDrawerState(state);
                                                if (!state) setMetaDataSelected(null);
                                            }}
                                        />
                                        <Separator />
                                    </div>
                                ) : (
                                    <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                                        {hasUploadDrafts || hasLeftoverDrafts
                                            ? "Upload DICOM, drag series onto the grid, then click the pencil icon to edit properties."
                                            : "Drag existing series onto the grid to combine them, then click the pencil icon to edit properties."}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold">{saveTitle}</h4>
                                    <div className="grid gap-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="upload-vis">Visibility</Label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">{saveForm.visibility === "PUBLIC" ? "Public" : "Private"}</span>
                                                <Switch
                                                    id="upload-vis"
                                                    checked={saveForm.visibility === "PUBLIC"}
                                                    onCheckedChange={(checked) => setSaveForm({ ...saveForm, visibility: checked ? "PUBLIC" : "PRIVATE" })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {hasUploadDrafts && (
                                        <div className="p-3 bg-muted/40 border rounded-md space-y-3">
                                            <div className="flex items-start gap-2">
                                                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                    Files are de-identified in your browser before upload. Burned-in names on the pixels are not removed.
                                                </p>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    id="phi-verification"
                                                    checked={phiVerified}
                                                    onCheckedChange={setPhiVerified}
                                                    className="mt-0.5"
                                                />
                                                <Label htmlFor="phi-verification" className="text-xs font-medium cursor-pointer leading-snug">
                                                    I have reviewed these images and confirm they do not contain burned-in names or other PHI on the pixels
                                                </Label>
                                            </div>
                                        </div>
                                    )}

                                    <Button className="w-full" onClick={handleSaveCase} disabled={isSaving || (hasUploadDrafts && !phiVerified)}>
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {isSaving
                                            ? uploadProgress != null
                                                ? `Uploading... ${uploadProgress}%`
                                                : "Saving..."
                                            : saveLabel}
                                    </Button>
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                </div>
                )}
            </div>
        </DndProvider>
    );
};


export default BuilderPage;
