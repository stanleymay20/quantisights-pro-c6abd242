import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { Brain, Loader2, AlertCircle, CheckCircle2, Shield, BarChart3, Zap, Target, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { label: "Authenticating secure session", icon: Shield },
  { label: "Provisioning Acme Corp workspace (B2B SaaS · €4.2M ARR)", icon: BarChart3 },
  { label: "Ingesting 15 months of revenue + conversion data", icon: Zap },
  { label: "Running diagnostic & advisory engines", icon: Brain },
  { label: "Initializing executive dashboard", icon: Target },
];

const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;

const Demo = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetrying, setAutoRetrying] = useState(false);

  const initDemo = useCallback(async (signal: AbortSignal) => {
    try {
      setError(null);
      setCurrentStep(0);

      await supabase.auth.signOut();

      sessionStorage.setItem("quantivis_demo_mode", "true");
      sessionStorage.removeItem("quantivis_org_id");
      sessionStorage.removeItem("quantivis_workspace_id");
      sessionStorage.removeItem("quantivis_project_id");

      localStorage.setItem("quantivis_welcome_completed", "true");
      localStorage.setItem("quantivis_tour_completed", "true");
      localStorage.setItem("quantivis_cookie_consent", JSON.stringify({ choice: "accepted", timestamp: new Date().toISOString() }));

      if (signal.aborted) return;
      setCurrentStep(1);

      const { data, error: fnErr } = await invokeWithRetry<Record<string, unknown>>(
        "create-demo-session",
        undefined,
        { maxAttempts: 3, baseDelayMs: 800 }
      );

      if (signal.aborted) return;

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(String(data.error));

      setCurrentStep(2);
      await new Promise(r => setTimeout(r, 300));

      if (signal.aborted) return;
      setCurrentStep(3);

      if (data?.org_id) sessionStorage.setItem("quantivis_org_id", String(data.org_id));
      if (data?.workspace_id) sessionStorage.setItem("quantivis_workspace_id", String(data.workspace_id));
      if (data?.project_id) sessionStorage.setItem("quantivis_project_id", String(data.project_id));

      const { error: sessErr } = await supabase.auth.setSession({
        access_token: String(data?.access_token ?? ""),
        refresh_token: String(data?.refresh_token ?? ""),
      });
      if (sessErr) throw sessErr;

      if (signal.aborted) return;
      setCurrentStep(4);
      await new Promise(r => setTimeout(r, 400));

      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      if (signal.aborted) return;
      console.error("Demo init error:", err);
      
      const message = err instanceof Error ? err.message : "Failed to create demo session";
      
      // Auto-retry on transient errors (up to MAX_RETRIES)
      if (retryCount < MAX_RETRIES - 1 && isTransientError(message)) {
        setAutoRetrying(true);
        setTimeout(() => {
          if (!signal.aborted) {
            setAutoRetrying(false);
            setRetryCount(c => c + 1);
          }
        }, 2000);
        return;
      }

      sessionStorage.removeItem("quantivis_demo_mode");
      setError(getUserFriendlyError(message));
    }
  }, [navigate, retryCount]);

  useEffect(() => {
    const abortController = new AbortController();

    const timeout = setTimeout(() => {
      if (!abortController.signal.aborted && currentStep < STEPS.length - 1) {
        setError("The demo environment is taking longer than usual. Please try again.");
      }
    }, TIMEOUT_MS);

    initDemo(abortController.signal);

    return () => {
      abortController.abort();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount(c => c + 1);
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        {/* Logo mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-8"
        >
          <Brain className="w-8 h-8 text-primary" />
        </motion.div>

        {error ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-center gap-2 text-destructive mb-3">
              <AlertCircle className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Could Not Load Demo</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:brightness-110 transition-all"
            >
              Try Again
            </button>
            <div className="flex flex-col items-center gap-2 mt-4">
              <button
                onClick={() => navigate("/register")}
                className="text-xs text-primary hover:text-foreground transition-colors flex items-center gap-1"
              >
                Create a free account instead <ArrowRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => navigate("/")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to home
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <h2 className="text-[16px] font-semibold tracking-tight tracking-tight mb-1 tracking-tight">
              {autoRetrying ? "Reconnecting…" : "Provisioning Your Environment"}
            </h2>
            <p className="text-xs text-muted-foreground mb-8">
              Setting up a fully populated decision intelligence workspace
            </p>

            {/* Progress bar */}
            <div className="h-1 rounded-full bg-muted mb-8 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
            </div>

            {/* Step list */}
            <div className="space-y-1.5 text-left mb-8">
              {STEPS.map((step, i) => {
                const isComplete = i < currentStep;
                const isCurrent = i === currentStep;
                const StepIcon = step.icon;

                return (
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: i <= currentStep ? 1 : 0.3, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isCurrent ? "bg-primary/[0.06]" : ""}`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <AnimatePresence mode="wait">
                        {isComplete ? (
                          <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-primary">
                            <CheckCircle2 className="w-4 h-4" />
                          </motion.div>
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                          <StepIcon className="w-3.5 h-3.5 text-muted-foreground/30" />
                        )}
                      </AnimatePresence>
                    </div>
                    <span className={`text-sm ${isCurrent ? "text-foreground font-medium" : isComplete ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                      {step.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Environment info card */}
            <div className="p-4 rounded-xl bg-card/60 border border-border/40">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-semibold text-foreground">Acme Corp · B2B SaaS · €4.2M ARR</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                Scenario: Declining conversion rate with rising churn. The system will identify root cause, recommend reallocation, and track the outcome.
              </p>
              <p className="text-[10px] text-muted-foreground/50">
                420 customers · 6 metric types · 5 decisions logged · 2 outcomes measured · 1 recalibration applied
              </p>
            </div>

            {/* Retry count indicator */}
            {retryCount > 0 && (
              <p className="text-[10px] text-muted-foreground/40 mt-3">
                Attempt {retryCount + 1} of {MAX_RETRIES}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

/** Check if the error is transient and worth auto-retrying */
function isTransientError(message: string): boolean {
  const transient = ["fetch", "network", "timeout", "502", "503", "504", "ECONNRESET", "Failed to fetch"];
  return transient.some(t => message.toLowerCase().includes(t.toLowerCase()));
}

/** Convert raw error messages to user-friendly text */
function getUserFriendlyError(message: string): string {
  if (message.includes("rate") || message.includes("limit") || message.includes("429")) {
    return "You've reached the demo session limit. Please wait a few minutes and try again, or create a free account to get started immediately.";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("Failed to fetch")) {
    return "We couldn't connect to our servers. Please check your internet connection and try again.";
  }
  if (message.includes("timeout")) {
    return "The demo environment took too long to provision. Please try again — it usually takes under 30 seconds.";
  }
  return "Something went wrong while setting up your demo environment. Please try again or create a free account.";
}

export default Demo;
