import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import { useContext } from "react";
import { DataContext } from '../context/DataContext.jsx';
import SAM3SegmentationDialog from './SAM3SegmentationDialog.jsx';
import { segmentCurrentSlice } from '../lib/sam3Analysis.js';
import { toast } from "sonner";

function SAM3SegmentationButton() {
    const { renderingEngine } = useContext(DataContext).data;

    // SAM 3 segmentation state
    const [showSegmentationDialog, setShowSegmentationDialog] = useState(false);
    const [segmentationResult, setSegmentationResult] = useState(null);
    const [isSegmenting, setIsSegmenting] = useState(false);

    // Handle SAM 3 Segmentation
    const handleSegmentation = async (textPrompt) => {
        if (!renderingEngine) {
            toast.error("Rendering engine not ready");
            return;
        }

        if (!textPrompt || textPrompt.trim().length === 0) {
            toast.error("Please enter a text prompt");
            return;
        }

        // Get the first viewport (0-vp) - you could make this dynamic
        const viewportId = '0-vp';

        setIsSegmenting(true);
        setSegmentationResult(null);

        try {
            const result = await segmentCurrentSlice(renderingEngine, viewportId, textPrompt);
            setSegmentationResult(result);

            if (result.success) {
                if (result.numObjects > 0) {
                    toast.success(`Found ${result.numObjects} object(s)!`);
                } else {
                    toast.info("No objects found matching the prompt");
                }
            } else {
                toast.error("Segmentation failed");
            }
        } catch (error) {
            console.error("Segmentation error:", error);
            setSegmentationResult({
                success: false,
                error: error.message
            });
            toast.error("Segmentation failed");
        } finally {
            setIsSegmenting(false);
        }
    };

    return (
        <>
            <Button
                onClick={() => setShowSegmentationDialog(true)}
                disabled={isSegmenting}
                variant="outline"
                className="fixed top-16 right-4 z-50"
                size="sm"
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                }}
            >
                <Scissors className="mr-2 h-4 w-4" strokeWidth={1.5} />
                {isSegmenting ? "Segmenting..." : "SAM 3"}
            </Button>

            {/* SAM 3 Segmentation Dialog */}
            <SAM3SegmentationDialog
                open={showSegmentationDialog}
                onOpenChange={setShowSegmentationDialog}
                onSegment={handleSegmentation}
                segmentationResult={segmentationResult}
                isLoading={isSegmenting}
            />
        </>
    );
}

export default SAM3SegmentationButton;
