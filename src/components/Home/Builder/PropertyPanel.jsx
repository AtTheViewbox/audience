import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import {
    clampSliceRange,
    getAdjustedWC,
    getAdjustedWW,
    getReveredAdjustedWC,
    getReveredAdjustedWW,
} from "./builderUtils";
import SliceRangeSlider from "./SliceRangeSlider";

const PropertyPanel = ({
    metadataId,
    metaDataList,
    setMetaDataList,
    onPropertyEdit,
    setDrawerState,
    embedded = false,
}) => {
    const metadata = metaDataList.find(m => m.id === metadataId);

    if (!metadata) return null;

    const handleChange = (key, value) => {
        setMetaDataList(prev => prev.map(item => {
            if (item.id === metadataId) {
                const next = { ...item, [key]: value };
                if (key === "start_slice" || key === "end_slice" || key === "ci") {
                    return { ...next, ...clampSliceRange(next) };
                }
                return next;
            }
            return item;
        }));
        onPropertyEdit?.();
    };

    const applyWindowPreset = (preset) => {
        setMetaDataList((prev) =>
            prev.map((item) => (item.id === metadataId ? { ...item, ww: preset.ww, wc: preset.wc } : item))
        );
        onPropertyEdit?.();
    };

    const windowPresets = Array.isArray(metadata.windowPresets) ? metadata.windowPresets : [];
    const isActivePreset = (preset) =>
        Math.round(getReveredAdjustedWW(metadata)) === Math.round(getReveredAdjustedWW({ ...metadata, ww: preset.ww })) &&
        Math.round(getReveredAdjustedWC(metadata)) === Math.round(getReveredAdjustedWC({ ...metadata, wc: preset.wc }));

    const handleSliceRange = (range) => {
        setMetaDataList((prev) =>
            prev.map((item) => (item.id === metadataId ? { ...item, ...range } : item))
        );
        onPropertyEdit?.();
    };

    const fields = (
        <>
            <p className="text-xs text-muted-foreground">
                Edit in the grid viewport, or adjust values here. Nothing uploads until you save.
            </p>
            {metadata.isDraft && (
                <p className="text-[10px] uppercase tracking-wide text-amber-500 font-semibold">
                    Local draft — not uploaded yet
                </p>
            )}
            <div className="space-y-2">
                <Label>Series name</Label>
                <Input
                    value={metadata.label || ""}
                    onChange={(e) => handleChange("label", e.target.value)}
                    placeholder="NONCON, arterial, …"
                />
            </div>
            <SliceRangeSlider metadata={metadata} onChange={handleSliceRange} />

            <div className="space-y-2">
                <Label>DICOM window presets</Label>
                {windowPresets.length ? (
                    <div className="flex flex-wrap gap-2">
                        {windowPresets.map((preset, i) => {
                            const ww = Math.round(getReveredAdjustedWW({ ...metadata, ww: preset.ww }));
                            const wc = Math.round(getReveredAdjustedWC({ ...metadata, wc: preset.wc }));
                            return (
                                <Button
                                    key={`${preset.label}-${i}`}
                                    type="button"
                                    size="sm"
                                    variant={isActivePreset(preset) ? "secondary" : "outline"}
                                    className="h-auto py-1 px-2 flex flex-col items-start"
                                    onClick={() => applyWindowPreset(preset)}
                                    title={`Apply WW ${ww} / WC ${wc}`}
                                >
                                    <span className="text-xs font-medium">{preset.label}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                        WW {ww} / WC {wc}
                                    </span>
                                </Button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {metadata.isDraft
                            ? "No window values in the DICOM header."
                            : "Not recorded for this series (uploaded before presets were saved)."}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label>Window Width (WW)</Label>
                <Input
                    type="number"
                    value={Math.round(getReveredAdjustedWW(metadata))}
                    onChange={(e) => {
                        const val = Number(e.target.value);
                        handleChange("ww", getAdjustedWW(val, metadata));
                    }}
                />
            </div>

            <div className="space-y-2">
                <Label>Window Center (WC)</Label>
                <Input
                    type="number"
                    value={Math.round(getReveredAdjustedWC(metadata))}
                    onChange={(e) => {
                        const val = Number(e.target.value);
                        handleChange("wc", getAdjustedWC(val, metadata));
                    }}
                />
            </div>
            <div className="space-y-2">
                <Label>Zoom</Label>
                <Input
                    type="number"
                    value={metadata.z}
                    onChange={(e) => handleChange("z", Number(e.target.value))}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Pan X</Label>
                    <Input
                        value={metadata.px}
                        onChange={(e) => handleChange("px", e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Pan Y</Label>
                    <Input
                        value={metadata.py}
                        onChange={(e) => handleChange("py", e.target.value)}
                    />
                </div>
            </div>
        </>
    );

    if (embedded) {
        return <div className="space-y-4">{fields}</div>;
    }

    return (
        <div className="h-full flex flex-col bg-background w-full min-h-0">
            <div className="flex items-center justify-between p-4 border-b shrink-0">
                <h3 className="font-semibold">Edit Properties</h3>
                <Button variant="ghost" size="icon" onClick={() => setDrawerState(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
                {fields}
            </div>
        </div>
    );
};

export default PropertyPanel;
