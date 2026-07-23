import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DISMISS_KEY = "quantivis_explainer_dismissed";

const SAMPLE_PROMPTS = [
  "Why are sales slowing?",
  "Where are we losing money?",
  "What decision should I make this week?",
];

/**
 * WhatIsQuantivis — first-time comprehension card.
 * Sits at the top of the dashboard. Plain-language explainer + 3 concrete
 * sample prompts a non-technical user can click to see the product in action.
 * Dismissible (persists across sessions via localStorage).
 */
const WhatIsQuantivis = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "true"
  );

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  const handlePromptClick = (prompt: string) => {
    // Route to copilot with prefilled query
    navigate(`/copilot?q=${encodeURIComponent(prompt)}`);
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
          transition={{ duration: 0.25 }}
          className="relative rounded-xl border border-border/40 p-5"
        >
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Dismiss explainer"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-start gap-3 mb-4 pr-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                What is Quantivis?
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                Quantivis turns business data into decisions, tracks outcomes, and learns which decisions actually work.
              </p>
            </div>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2 ml-12">
            Try asking
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 ml-12">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handlePromptClick(prompt)}
                className="group text-left text-xs px-3 py-2 rounded-lg border border-border/40 bg-background/60 hover:border-primary/40 hover:bg-primary/[0.04] transition-all flex items-center justify-between gap-2"
              >
                <span className="text-foreground/80 group-hover:text-foreground">{prompt}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WhatIsQuantivis;
