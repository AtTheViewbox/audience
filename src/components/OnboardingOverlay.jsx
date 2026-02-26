import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Mouse, Contrast, ZoomIn, Sparkles, Radio, Pointer, MousePointerClick, ArrowDownLeft, ArrowUpLeft, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "attheviewbox_onboarding_seen";

// ─── Step definitions ───────────────────────────────────────────────────────
const HOME_STEPS = [
    {
        icon: <Mouse className="h-6 w-6" />,
        title: "Browse Sample Cases",
        description: "Explore pre-saved imaging cases from the public library — no login required.",
        arrow: null,
    },
    {
        icon: <ZoomIn className="h-6 w-6" />,
        title: "Upload Your Own",
        description: "Sign in and upload DICOM scans from the Home page. They'll appear instantly in Your Viewbox.",
        arrow: null,
    },
];

const VIEWER_STEPS = [
    {
        icon: <Mouse className="h-6 w-6" />,
        title: "Scroll Through Slices",
        description: "Use the middle mouse button or click and drag to scroll through slices.",
        arrow: null,
    },
    {
        icon: <Contrast className="h-6 w-6" />,
        title: "Toolbar Controls",
        description: "Use the toolbar to adjust Window/Level, Zoom, or Pan the image.",
        arrow: "top-left",
    },
    {
        icon: <Sparkles className="h-6 w-6" />,
        title: "MedGemma AI",
        description: "Logged-in users can use the MedGemma assistant to analyze findings and segment structures.",
        arrow: "top-right",
    },
    {
        icon: <MousePointerClick className="h-6 w-6" />,
        title: "Generate a Session",
        description: "Click the white button in the lower-left corner or ask MedGemma to generate a shareable session.",
        arrow: "top-right",
    },
    {
        icon: <Radio className="h-6 w-6" />,
        title: "Share Your Session",
        description: "HOLD the white button (bottom-left) to start sharing your viewport in real time.",
        arrow: "bottom-left",
    },
    {
        icon: <Pointer className="h-6 w-6" />,
        title: "Activate Pointer",
        description: "In an active session, double-tap the viewport to activate the pointer for live annotation.",
        arrow: null,
    },
];

// ─── Individual dot-step indicators ─────────────────────────────────────────
function StepDots({ count, current }) {
    return (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-6 bg-white" : "w-1.5 bg-white/30"
                        }`}
                />
            ))}
        </div>
    );
}

// ─── Arrow indicator ────────────────────────────────────────────────────────
function ArrowIndicator({ direction }) {
    if (!direction) return null;

    // Position the arrow away from the corner so it visually points toward the UI element
    const positionStyle = {
        "top-left": { top: '80px', left: '180px' },
        "top-right": { top: '80px', right: '180px' },
        "bottom-left": { bottom: '56px', left: '56px' },
        "bottom-right": { bottom: '56px', right: '56px' },
    };

    const arrowIcon = {
        "top-left": <ArrowUpLeft className="h-7 w-7" />,
        "top-right": <ArrowUpRight className="h-7 w-7" />,
        "bottom-left": <ArrowDownLeft className="h-7 w-7" />,
        "bottom-right": <ArrowDownRight className="h-7 w-7" />,
    };

    return (
        <div
            className="fixed z-[10000] text-white animate-bounce pointer-events-none drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"
            style={positionStyle[direction]}
        >
            {arrowIcon[direction]}
        </div>
    );
}

// ─── Step card ──────────────────────────────────────────────────────────────
function StepCard({ step }) {
    return (
        <div className="flex flex-col items-center text-center gap-4 px-2 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white backdrop-blur-sm">
                {step.icon}
            </div>
            <div>
                <h3 className="text-lg font-bold text-white mb-1">{step.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed max-w-xs">{step.description}</p>
            </div>
        </div>
    );
}

// ─── Main overlay ───────────────────────────────────────────────────────────
export default function OnboardingOverlay({ page = "home" }) {
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(0);

    const steps = page === "home" ? HOME_STEPS : VIEWER_STEPS;

    useEffect(() => {
        try {
            const seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            if (!seen[page]) {
                setVisible(true);
            }
        } catch {
            setVisible(true);
        }
    }, [page]);

    const dismiss = () => {
        setVisible(false);
        try {
            const seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            seen[page] = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
        } catch { }
    };

    const next = () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            dismiss();
        }
    };

    const prev = () => {
        if (step > 0) setStep(step - 1);
    };

    if (!visible) return null;

    const currentStep = steps[step];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop — no blur so users can see the UI underneath */}
            <div
                className="absolute inset-0 bg-black/60"
                onClick={dismiss}
            />

            {/* Directional Arrow */}
            <ArrowIndicator direction={currentStep.arrow} />

            {/* Card */}
            <div className="relative z-10 w-[380px] max-w-[90vw] bg-slate-950/90 border border-white/10 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 backdrop-blur-xl">
                {/* Skip / Close */}
                <button
                    onClick={dismiss}
                    className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>

                {/* Header badge */}
                <div className="text-[10px] uppercase tracking-widest font-bold text-white/40">
                    {page === "home" ? "Getting Started" : "Viewer Controls"}
                </div>

                {/* Step content */}
                <StepCard step={currentStep} />

                {/* Dots */}
                <StepDots count={steps.length} current={step} />

                {/* Navigation */}
                <div className="flex items-center gap-3 w-full">
                    {step > 0 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={prev}
                            className="text-white/50 hover:text-white hover:bg-white/10 flex-1"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Back
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={dismiss}
                            className="text-white/40 hover:text-white/70 hover:bg-white/5 flex-1"
                        >
                            Skip
                        </Button>
                    )}

                    <Button
                        size="sm"
                        onClick={next}
                        className="bg-white text-slate-950 hover:bg-white/90 font-semibold flex-1 shadow-lg shadow-white/10"
                    >
                        {step < steps.length - 1 ? (
                            <>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                        ) : (
                            "Get Started"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
