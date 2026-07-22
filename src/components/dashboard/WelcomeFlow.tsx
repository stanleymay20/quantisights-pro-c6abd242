import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Upload, Target, CheckCircle2, ArrowRight, X, FileSpreadsheet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const WELCOME_KEY = "quantivis_welcome_completed";
const DEMO_MODE_KEY = "quantivis_demo_mode";

interface WelcomeFlowProps {
  hasData: boolean;
  displayName: string;
}

/**
 * Guided First Decision — 3-step onboarding (audit edit #1, priority #1).
 *
 * The concrete path from "what is this?" to "I made my first decision":
 *   1. Connect data
 *   2. Describe your goal
 *   3. Approve your first decision
 *
 * Replaces the prior generic 3-screen welcome which described features
 * but never told the user what to actually do next.
 */
const STEPS = [
  {
    number: 1,
    icon: Upload,
    title: "Connect your data",
    subtitle: "Step 1 of 3",
    description:
      "Upload a CSV with your business metrics — revenue, costs, customers, anything you track. Quantivis activates within seconds. No setup required.",
    primaryCta: "Upload a CSV",
    primaryPath: "/data-upload",
    secondaryCta: "Try the demo instead",
    secondaryPath: "/demo",
    tip: "Don't have a file ready? The demo loads 15 months of sample B2B data so you can explore the full flow.",
  },
  {
    number: 2,
    icon: Target,
    title: "Describe your goal",
    subtitle: "Step 2 of 3",
    description:
      "Tell the Copilot what decision you need to make — \"Why are sales slowing?\", \"Where are we losing money?\", or \"What should I do this week?\". Quantivis generates a Decision Brief with evidence, expected impact, and recommended action.",
    primaryCta: "Open Copilot",
    primaryPath: "/copilot",
    tip: "Every Decision Brief shows confidence, source data, and risk — so you always know why it was recommended.",
  },
  {
    number: 3,
    icon: CheckCircle2,
    title: "Approve your first decision",
    subtitle: "Step 3 of 3",
    description:
      "Review the recommendation, approve or reject it, and Quantivis logs it to your Decision Ledger. Outcomes are tracked automatically so the system learns which decisions actually work for your business.",
    primaryCta: "Go to Decisions",
    primaryPath: "/decisions",
    tip: "Your Ledger becomes a board-defensible audit trail — every decision, evidence, and outcome in one place.",
  },
];

const WelcomeFlow = ({ hasData, displayName }: WelcomeFlowProps) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the dialog when it becomes visible (WCAG 2.4.3)
  useEffect(() => {
    if (visible && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [visible]);

  // Trap focus within the dialog while it is open (WCAG 2.1.2)
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  useEffect(() => {
    const isDemoMode = sessionStorage.getItem(DEMO_MODE_KEY) === "true";

    if (hasData || isDemoMode) {
      setVisible(false);
      return;
    }

    const completed = localStorage.getItem(WELCOME_KEY);
    if (!completed) {
      const timer = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(timer);
    }

    setVisible(false);
  }, [hasData]);

  const handleComplete = () => {
    localStorage.setItem(WELCOME_KEY, "true");
    localStorage.setItem("quantivis_tour_completed", "true");
    setVisible(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleComplete();
  };

  const handlePrimary = (path: string) => {
    handleComplete();
    navigate(path);
  };

  const handleSecondary = (path: string) => {
    handleComplete();
    navigate(path);
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          aria-hidden="true"
        >
          <motion.div
            ref={dialogRef}
            key={step}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-dialog-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-lg bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden outline-none"
          >
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: `${(step / STEPS.length) * 100}%` }}
                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            <button
              onClick={handleComplete}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Skip onboarding"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-8 pt-6">
              {/* Step dots showing the 3-step journey */}
              <div className="flex items-center gap-2 mb-5">
                {STEPS.map((s, i) => (
                  <div key={s.number} className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        i === step
                          ? "bg-primary text-primary-foreground"
                          : i < step
                          ? "bg-primary/30 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.number}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-6 transition-all ${
                          i < step ? "bg-primary/30" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {step === 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                  Welcome, <span className="font-semibold text-foreground">{displayName}</span> 👋
                  &nbsp;Let's get you to your first decision.
                </p>
              )}

              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-7 h-7 text-primary" />
              </div>

              <p className="text-xs text-primary/80 font-medium mb-1">{current.subtitle}</p>
              <h2 id="welcome-dialog-title" className="text-[16px] font-semibold tracking-tight tracking-tight mb-2">{current.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {current.description}
              </p>

              {current.tip && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/[0.06] border border-primary/10 mb-5">
                  <FileSpreadsheet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/80 leading-relaxed">{current.tip}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
                <button
                  onClick={handleComplete}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {current.secondaryCta && current.secondaryPath && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSecondary(current.secondaryPath!)}
                      className="text-xs"
                    >
                      {current.secondaryCta}
                    </Button>
                  )}
                  {step < STEPS.length - 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNext}
                      className="text-xs"
                    >
                      Next step
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handlePrimary(current.primaryPath)}
                    className="gap-1.5"
                  >
                    {current.primaryCta} <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeFlow;
