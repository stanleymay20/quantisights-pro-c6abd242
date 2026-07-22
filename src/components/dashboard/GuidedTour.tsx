import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Brain, Rocket, ArrowRight, X, Sparkles,
} from "lucide-react";

const TOUR_STEPS = [
  {
    icon: BarChart3,
    title: "Your Command Center",
    description:
      "Real-time KPIs, anomaly detection, and revenue tracking — all derived from your verified data. No vanity metrics.",
    highlight: "KPI cards update automatically as new data flows in.",
  },
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description:
      "Our intelligence engine surfaces critical signals, diagnoses root causes, and recommends actions — before you ask.",
    highlight: "Every insight includes confidence scores and source evidence.",
  },
  {
    icon: Rocket,
    title: "20+ Strategic Tools",
    description:
      "Monte Carlo simulations, causal inference, bias detection, scenario branching, executive convergence, and more — all in your sidebar.",
    highlight: "Start with Advisory and Diagnostics, then explore deeper.",
  },
];

const TOUR_STORAGE_KEY = "quantivis_tour_completed";

interface GuidedTourProps {
  onComplete?: () => void;
}

const GuidedTour = ({ onComplete }: GuidedTourProps) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (visible) dialogRef.current?.focus(); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const els = dialogRef.current.querySelectorAll<HTMLElement>('button,[href],input,[tabindex]:not([tabindex="-1"])');
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [visible]);

  useEffect(() => {
    const tourCompleted = localStorage.getItem(TOUR_STORAGE_KEY);
    const welcomeCompleted = localStorage.getItem("quantivis_welcome_completed");
    // Skip tour if already completed OR if the welcome flow was shown (it covers onboarding)
    if (tourCompleted || welcomeCompleted) return;
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    setVisible(false);
    onComplete?.();
  };

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

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
            aria-labelledby="tour-dialog-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden outline-none"
          >
            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: `${(step / TOUR_STEPS.length) * 100}%` }}
                animate={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            {/* Dismiss */}
            <button
              onClick={handleComplete}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Skip tour"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Content */}
            <div className="p-8 pt-6">
              {/* Step indicator */}
              <div className="flex items-center gap-1.5 mb-6">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step
                        ? "w-6 bg-primary"
                        : i < step
                        ? "w-3 bg-primary/40"
                        : "w-3 bg-muted-foreground/20"
                    }`}
                  />
                ))}
              </div>

              {/* Icon */}
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                <Icon className="w-7 h-7 text-primary" />
              </div>

              {/* Text */}
              <h2 id="tour-dialog-title" className="text-[16px] font-semibold tracking-tight tracking-tight mb-2">{current.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {current.description}
              </p>

              {/* Highlight callout */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/[0.06] border border-primary/10 mb-6">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {current.highlight}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleComplete}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip tour
                </button>
                <Button onClick={handleNext} size="sm" className="gap-1.5">
                  {isLast ? "Start Exploring" : "Next"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GuidedTour;
