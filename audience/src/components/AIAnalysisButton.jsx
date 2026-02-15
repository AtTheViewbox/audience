import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useContext } from "react";
import { DataContext } from '../context/DataContext.jsx';
import PathologyAnalysisDialog from './PathologyAnalysisDialog.jsx';
import { analyzeCurrentSlice } from '../lib/geminiAnalysis.js';
import { toast } from "sonner";

function AIAnalysisButton() {
    const { renderingEngine } = useContext(DataContext).data;

    // AI Analysis state
    const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Handle AI Analysis
    const handleAIAnalysis = async () => {
        if (!renderingEngine) {
            toast.error("Rendering engine not ready");
            return;
        }

        // Get the first viewport (0-vp) - you could make this dynamic
        const viewportId = '0-vp';

        setIsAnalyzing(true);
        setShowAnalysisDialog(true);
        setAnalysisResult(null);

        try {
            const result = await analyzeCurrentSlice(renderingEngine, viewportId);
            setAnalysisResult(result);

            if (result.success) {
                toast.success("Analysis complete!");
            } else {
                toast.error("Analysis failed");
            }
        } catch (error) {
            console.error("Analysis error:", error);
            setAnalysisResult({
                success: false,
                error: error.message
            });
            toast.error("Analysis failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <>
            <Button
                onClick={handleAIAnalysis}
                disabled={isAnalyzing}
                variant="outline"
                className="fixed top-4 right-4 z-50"
                size="sm"
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                }}
            >
                <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
                {isAnalyzing ? "Analyzing..." : "AI"}
            </Button>

            {/* AI Analysis Dialog */}
            <PathologyAnalysisDialog
                open={showAnalysisDialog}
                onOpenChange={setShowAnalysisDialog}
                analysisResult={analysisResult}
                isLoading={isAnalyzing}
            />
        </>
    );
}

export default AIAnalysisButton;
