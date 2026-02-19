import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import ViewportComp from "./ViewportComp";
import { 
    getAdjustedWC, 
    getAdjustedWW, 
    getReveredAdjustedWC, 
    getReveredAdjustedWW 
} from "./builderUtils";

const PropertyPanel = ({
  metadataId,
  metaDataList,
  setMetaDataList,
  setDrawerState
}) => {
  const metadata = metaDataList.find(m => m.id === metadataId);
  const [stateFlag, setStateFlag] = useState(false);

  if (!metadata) return null;

  const handleChange = (key, value) => {
      setStateFlag(true); // Signal that input changed
      setMetaDataList(prev => prev.map(item => {
          if (item.id === metadataId) {
              return { ...item, [key]: value };
          }
          return item;
      }));
  };

  const handleViewportUpdate = (updates) => {
      // Updates from viewport interaction (don't set stateFlag to avoid loop)
      setMetaDataList(prev => prev.map(item => {
          if (item.id === metadataId) {
              return { ...item, ...updates };
          }
          return item;
      }));
  };

  return (
    <div className="h-full flex flex-col bg-background border-l w-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Edit Properties</h3>
        <Button variant="ghost" size="icon" onClick={() => setDrawerState(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Viewport Preview */}
      <div className="w-full aspect-square bg-black border-b relative">
        <ViewportComp 
            metadata={metadata} 
            stateFlag={stateFlag} 
            setStateFlag={setStateFlag} 
            onUpdate={handleViewportUpdate}
            // Key ensures we remount if switching items, cleaner state
            key={metadataId} 
        />
      </div>
      
      <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="space-y-2">
              <Label>Label</Label>
              <Input 
                  value={metadata.label || ""} 
                  onChange={(e) => handleChange("label", e.target.value)} 
              />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                  <Label>Start Slice</Label>
                  <Input 
                      type="number" 
                      value={metadata.start_slice} 
                      onChange={(e) => handleChange("start_slice", Number(e.target.value))} 
                  />
              </div>
              <div className="space-y-2">
                  <Label>End Slice</Label>
                  <Input 
                      type="number" 
                      value={metadata.end_slice} 
                      onChange={(e) => handleChange("end_slice", Number(e.target.value))} 
                  />
              </div>
          </div>

          <div className="space-y-2">
              <Label>Window Width (WW)</Label>
              <Input 
                  type="number" 
                  // "ReveredAdjusted" converts Raw (Stored) -> HU (Display)
                  value={Math.round(getReveredAdjustedWW(metadata))} 
                  onChange={(e) => {
                      // "Adjusted" converts HU (Display) -> Raw (Stored)
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
              <Label>Initial Slice (CI)</Label>
              <Input 
                  type="number" 
                  value={metadata.ci} 
                  onChange={(e) => handleChange("ci", Number(e.target.value))} 
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


      </div>
    </div>
  );
};

export default PropertyPanel;
