import { useState, useContext, useEffect } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Hand,
  ClipboardList,
  Radio,
  QrCode,
  Copy,
  Check,
  PlayCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpLeft,
  Smartphone,
  Keyboard,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { DataContext } from "../context/DataContext.jsx";
import { buildJoinLink } from "../lib/shareSession.js";
import { isDemoMode, isSessionJoin } from "../lib/demoCase.js";

function StepDots({ count, current }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current ? "w-6 bg-white" : "w-1.5 bg-white/30"
          }`}
        />
      ))}
    </div>
  );
}

function ArrowIndicator({ direction }) {
  if (!direction) return null;

  const positionStyle = {
    "bottom-left": { bottom: "56px", left: "56px" },
    "top-right": { top: "80px", right: "180px" },
    "top-left": { top: "80px", left: "180px" },
    "show-answer": { top: "188px", left: "236px" },
  };

  const arrowIcon = {
    "bottom-left": <ArrowDownLeft className="h-7 w-7" />,
    "top-right": <ArrowUpRight className="h-7 w-7" />,
    "top-left": <ArrowUpLeft className="h-7 w-7" />,
    "show-answer": <ArrowUpLeft className="h-7 w-7" />,
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

function JoinQrStep({ sessionId }) {
  const [copied, setCopied] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const joinLink = buildJoinLink(sessionId);

  useEffect(() => {
    if (sessionId) return undefined;
    const t = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(t);
  }, [sessionId]);

  const copyLink = async () => {
    if (!joinLink) return;
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center text-center gap-3 px-2">
        <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
          <QrCode className="h-6 w-6 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-white">
          {timedOut ? "Couldn't auto-start the session" : "Starting your session"}
        </h3>
        <p className="text-sm text-white/70 leading-relaxed max-w-xs">
          {timedOut
            ? "Click the white button in the lower-left corner to open share settings, then reopen this guide."
            : "Setting you up as host. The join QR will appear here in a moment."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center gap-3 px-2">
      <div className="rounded-xl bg-white p-3 shadow-lg">
        <QRCodeSVG value={joinLink} size={168} />
      </div>
      <div className="flex items-center gap-2 text-blue-300">
        <Smartphone className="h-4 w-4" />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          Scan with your phone
        </span>
      </div>
      <h3 className="text-lg font-bold text-white">You are the host</h3>
      <p className="text-sm text-white/70 leading-relaxed max-w-xs">
        Open the camera on your phone and scan this QR to join from your device.
        You will stay host on this screen; your phone joins as a participant.
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={copyLink}
        className="text-white/80 hover:text-white hover:bg-white/10"
      >
        {copied ? (
          <Check className="h-4 w-4 mr-1.5" />
        ) : (
          <Copy className="h-4 w-4 mr-1.5" />
        )}
        {copied ? "Copied" : "Copy join link"}
      </Button>
    </div>
  );
}

const STEPS = [
  {
    id: "join",
    icon: <QrCode className="h-6 w-6" />,
    title: "Invite others to join",
    description:
      "You are already hosting this case. Scan the QR with your phone to join as a participant on a second screen.",
    arrow: null,
    custom: true,
  },
  {
    id: "navigate",
    icon: <Hand className="h-6 w-6" />,
    title: "Navigate on your phone",
    description: "On the image:",
    bullets: [
      "1 finger — scroll through slices",
      "2 fingers — zoom and pan",
      "3 fingers — window/level",
    ],
    arrow: null,
  },
  {
    id: "questions",
    icon: <ClipboardList className="h-6 w-6" />,
    title: "Ask and answer questions",
    description:
      "On your phone, tap the questions control in the top-right. Draw a box on the image when you answer, then submit.",
    arrow: "top-right",
  },
  {
    id: "share",
    icon: <Radio className="h-6 w-6" />,
    title: "Share your viewport live",
    description:
      "On your phone, tap the white button to broadcast — it turns red while sharing. Long-hold the image to display the pointer.",
    arrow: "bottom-left",
  },
  {
    id: "answer",
    icon: <Keyboard className="h-6 w-6" />,
    title: "Reveal the answer",
    description:
      "Press Space, or click Show Answer, to display the distribution of answers.",
    arrow: "show-answer",
  },
];

export default function DemoOnboardingOverlay() {
  const { sessionId } = useContext(DataContext).data;
  const joining = isSessionJoin();
  const steps = joining ? STEPS.filter((s) => s.id !== "join") : STEPS;
  const [visible, setVisible] = useState(() => isDemoMode());
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isDemoMode()) setVisible(false);
  }, []);

  if (!isDemoMode()) return null;

  const dismiss = () => setVisible(false);
  const reopen = () => {
    setStep(0);
    setVisible(true);
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else dismiss();
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const current = steps[step];

  return (
    <>
      {!visible && (
        <button
          type="button"
          onClick={reopen}
          className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full border border-blue-400/40 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-blue-200 shadow-lg backdrop-blur-md hover:bg-slate-900"
        >
          <PlayCircle className="h-4 w-4" />
          Demo guide
        </button>
      )}

      {visible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={dismiss} />
          <ArrowIndicator direction={current?.arrow} />

          <div className="relative z-10 w-[400px] max-w-[90vw] bg-slate-950/90 border border-white/10 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 backdrop-blur-xl">
            <button
              onClick={dismiss}
              className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-[10px] uppercase tracking-widest font-bold text-blue-300/80">
              Live Demo
            </div>

            {current?.custom ? (
              <JoinQrStep sessionId={sessionId} />
            ) : (
              <div className="flex flex-col items-center text-center gap-4 px-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white backdrop-blur-sm">
                  {current.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">{current.title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed max-w-xs">
                    {current.description}
                  </p>
                  {current.bullets?.length ? (
                    <ul className="mt-3 space-y-1.5 text-left text-sm text-white/70 max-w-xs">
                      {current.bullets.map((item) => (
                        <li key={item} className="flex gap-2 leading-snug">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}

            <StepDots count={steps.length} current={step} />

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
                  "Start reading"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
