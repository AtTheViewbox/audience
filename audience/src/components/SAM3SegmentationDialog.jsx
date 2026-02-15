import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

function SAM3SegmentationDialog({ open, onOpenChange, onSegment, segmentationResult, isLoading }) {
    const [textPrompt, setTextPrompt] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (textPrompt.trim()) {
            onSegment(textPrompt);
        }
    };

    const examplePrompts = [
        'lung',
        'heart',
        'liver',
        'kidney',
        'tumor',
        'abnormality'
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        SAM 3 Segmentation
                    </DialogTitle>
                    <DialogDescription>
                        Segment anatomical structures or pathology using text prompts.
                        Powered by Meta's Segment Anything Model 3.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Text Prompt Input */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="prompt">What would you like to segment?</Label>
                            <Input
                                id="prompt"
                                placeholder="e.g., lung, heart, tumor..."
                                value={textPrompt}
                                onChange={(e) => setTextPrompt(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        {/* Example Prompts */}
                        <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">Quick examples:</Label>
                            <div className="flex flex-wrap gap-2">
                                {examplePrompts.map((example) => (
                                    <Button
                                        key={example}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setTextPrompt(example)}
                                        disabled={isLoading}
                                    >
                                        {example}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading || !textPrompt.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Segmenting...
                                </>
                            ) : (
                                'Segment Image'
                            )}
                        </Button>
                    </form>

                    {/* Results Section */}
                    {segmentationResult && (
                        <div className="space-y-3 pt-4 border-t">
                            <h3 className="font-semibold">Results:</h3>

                            {segmentationResult.success ? (
                                <div className="space-y-2">
                                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md">
                                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                                            ✓ Found {segmentationResult.numObjects} object(s)
                                        </p>
                                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                                            Prompt: "{segmentationResult.prompt}"
                                        </p>
                                    </div>

                                    {/* Object Details */}
                                    {segmentationResult.numObjects > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-sm">Detected Objects:</Label>
                                            {segmentationResult.scores.map((score, idx) => (
                                                <div key={idx} className="p-2 bg-muted rounded text-sm">
                                                    Object {idx + 1}: Confidence {(score * 100).toFixed(1)}%
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Info about overlay */}
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription className="text-sm">
                                            Segmentation masks will be displayed as colored overlays on the image.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            ) : (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        <strong>Error:</strong> {segmentationResult.error}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Setup Instructions (if not configured) */}
                    {!isLoading && !segmentationResult && (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                                <strong>First time setup:</strong>
                                <ol className="list-decimal list-inside mt-2 space-y-1">
                                    <li>Create free account at huggingface.co</li>
                                    <li>Request access to facebook/sam3 model</li>
                                    <li>Generate API token in settings</li>
                                    <li>Add VITE_HUGGINGFACE_API_TOKEN to .env</li>
                                </ol>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default SAM3SegmentationDialog;
