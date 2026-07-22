import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Gauge, User, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { getSeverityStyle } from "@/lib/severity-colors";
import type { Insight } from "@/hooks/useInsights";

interface ExecutivePriorityStackProps {
  insights: Insight[];
}

/** Map category to accountable owner + action verb */
const OWNER_MAP: Record<string, { owner: string; verb: string }> = {
  revenue: { owner: "CRO", verb: "Recover" },
  churn: { owner: "VP CS", verb: "Retain" },
  cost: { owner: "CFO", verb: "Optimize" },
  growth: { owner: "CGO", verb: "Accelerate" },
  margin: { owner: "CFO", verb: "Improve" },
  conversion: { owner: "VP Growth", verb: "Fix" },
  operational: { owner: "COO", verb: "Resolve" },
};

/** Derive impact estimate from category */
function deriveImpact(category: string | null): string {
  if (!category) return "Quantify after analysis";
  const key = category.toLowerCase();
  if (key.includes("revenue")) return "+5–15% revenue recovery";
  if (key.includes("churn")) return "−2–4pp churn reduction";
  if (key.includes("cost")) return "+8–12% margin improvement";
  if (key.includes("growth")) return "+10–20% growth acceleration";
  if (key.includes("margin")) return "+3–5pp gross margin lift";
  if (key.includes("conversion")) return "+15–25% conversion lift";
  if (key.includes("operational")) return "−20–30% cycle time";
  return "Impact quantifiable post-analysis";
}

function getOwner(category: string | null): { owner: string; verb: string } {
  if (!category) return { owner: "Decision Owner", verb: "Act" };
  const key = category.toLowerCase();
  for (const [k, v] of Object.entries(OWNER_MAP)) {
    if (key.includes(k)) return v;
  }
  return { owner: "Decision Owner", verb: "Act" };
}

const RANK_COLORS = [
  "bg-destructive text-destructive-foreground",
  "bg-warning text-warning-foreground",
  "bg-primary text-primary-foreground",
];

/**
 * Executive Priority Stack — Top 3 actions ranked by urgency × impact.
 * Answers: "What should I do next?" in ≤5 seconds.
 */
const ExecutivePriorityStack = memo(({ insights }: ExecutivePriorityStackProps) => {
  const navigate = useNavigate();

  const priorities = useMemo(() => {
    const actionable = insights
      .filter(i => i.severity === "high" || i.severity === "medium")
      .sort((a, b) => {
        // Sort by severity first, then confidence
        const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
        const aSev = sevOrder[a.severity] ?? 3;
        const bSev = sevOrder[b.severity] ?? 3;
        if (aSev !== bSev) return aSev - bSev;
        const aConf = a.capped_confidence ?? a.confidence_score ?? 0;
        const bConf = b.capped_confidence ?? b.confidence_score ?? 0;
        return bConf - aConf;
      })
      .slice(0, 3);
    return actionable;
  }, [insights]);

  if (priorities.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="max-w-[1400px]"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold tracking-tight">Priority Actions</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">Ranked by urgency × confidence</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {priorities.map((insight, idx) => {
          const style = getSeverityStyle(insight.severity);
          const confidence = insight.capped_confidence ?? insight.confidence_score ?? 0;
          const { owner, verb } = getOwner(insight.category);
          const impact = deriveImpact(insight.category);
          const timeframe = insight.severity === "high" ? "7 days" : "14 days";

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.08 }}
            >
              <Card
                className={`border ${style.border} hover:shadow-md transition-all cursor-pointer group h-full`}
                onClick={() => navigate("/diagnostics")}
              >
                <CardContent className="p-4 flex flex-col h-full">
                  {/* Rank badge + severity */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black ${RANK_COLORS[idx] ?? "bg-muted text-muted-foreground"}`}>
                      {idx + 1}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${style.text}`}>
                      {style.label}
                    </span>
                    <ConfidenceBadge confidence={confidence} className="ml-auto text-[10px]" />
                  </div>

                  {/* Action statement */}
                  <p className="text-sm font-semibold text-foreground leading-snug mb-2 line-clamp-2 flex-1">
                    {verb}: {insight.message}
                  </p>

                  {/* Impact */}
                  <p className="text-xs text-primary font-medium mb-3">
                    Expected: {impact}
                  </p>

                  {/* Metadata row */}
                  <div className="flex items-center gap-3 pt-2 border-t border-border/20 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-2.5 h-2.5" />
                      <span className="font-semibold text-foreground">{owner}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {timeframe}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      Resolve <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
});

ExecutivePriorityStack.displayName = "ExecutivePriorityStack";

export default ExecutivePriorityStack;
