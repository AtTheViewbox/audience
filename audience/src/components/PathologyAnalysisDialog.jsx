import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Sparkles } from "lucide-react";

/**
 * Dialog component to display AI pathology analysis results
 */
function PathologyAnalysisDialog({ open, onOpenChange, analysisResult, isLoading }) {
    const [formattedAnalysis, setFormattedAnalysis] = useState(null);

    useEffect(() => {
        if (analysisResult?.analysis) {
            // Format the analysis text into sections
            setFormattedAnalysis(formatAnalysisText(analysisResult.analysis));
        }
    }, [analysisResult]);

    const formatAnalysisText = (text) => {
        // Split by numbered sections or markdown headers
        const sections = text.split(/\n(?=\d+\.\s|\#{1,3}\s)/);
        return sections.map((section, index) => {
            // Clean up the section
            const cleanSection = section.trim();
            if (!cleanSection) return null;

            // Check if it's a header line (starts with number or #)
            const headerMatch = cleanSection.match(/^(\d+\.\s\*\*([^*]+)\*\*|\#{1,3}\s(.+)|(\d+)\.\s(.+?)(?:\n|:))/);

            if (headerMatch) {
                const headerText = headerMatch[2] || headerMatch[3] || headerMatch[5] || '';
                const content = cleanSection.substring(headerMatch[0].length).trim();

                return (
                    <div key={index} className="mb-4">
                        <h3 className="font-semibold text-sm mb-2 text-primary flex items-center gap-2">
                            <span className="text-muted-foreground">•</span>
                            {headerText}
                        </h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-4">
                            {content}
                        </p>
                    </div>
                );
            }

            return (
                <p key={index} className="text-sm mb-3 whitespace-pre-wrap">
                    {cleanSection}
                </p>
            );
        }).filter(Boolean);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        AI Pathology Analysis
                    </DialogTitle>
                    <DialogDescription>
                        AI-powered analysis of the current DICOM slice
                    </DialogDescription>
                </DialogHeader>

                {/* Disclaimer Banner */}
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-200">
                            <strong>Educational Use Only:</strong> This AI analysis is for learning purposes and should NOT be used for clinical diagnosis or treatment decisions.
                        </div>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <p className="text-sm text-muted-foreground">Analyzing image with AI...</p>
                        <p className="text-xs text-muted-foreground mt-2">This may take a few seconds</p>
                    </div>
                )}

                {/* Error State */}
                {!isLoading && analysisResult?.error && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">Analysis Failed</h4>
                                <p className="text-sm text-red-700 dark:text-red-300">{analysisResult.error}</p>
                                {analysisResult.error.includes('API key') && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                                        Get your free API key from{' '}
                                        <a
                                            href="https://aistudio.google.com/app/apikey"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline hover:text-red-800"
                                        >
                                            Google AI Studio
                                        </a>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Success State - Analysis Results */}
                {!isLoading && analysisResult?.success && analysisResult?.analysis && (
                    <div className="space-y-4">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            {formattedAnalysis || (
                                <p className="text-sm whitespace-pre-wrap">{analysisResult.analysis}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                {!isLoading && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default PathologyAnalysisDialog;
