import { ArrowRight, Zap, TrendingDown, Eye, AlertTriangle, BookOpen, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Insight } from "@/hooks/useInsights";
import { filterCriticalInsights } from "@/lib/insight-filters";
interface DailyActionsProps {
  insights: Insight[];
  hasData: boolean;
  churnRate: number;
  revenue: number;
  pendingDecisions?: number;
  calibrationScore?: number | null;
}

interface Action {
  id: string;
  icon: typeof Zap;
  title: string;
  description: string;
  path: string;
  cta: string;
  priority: "critical" | "high" | "medium";
  color: string;
}

const PRIORITY_STYLES = {
  critical: "border-destructive/20 bg-destructive/[0.03]",
  high: "border-warning/20 bg-warning/[0.03]",
  medium: "border-primary/20 bg-primary/[0.03]",
};

const DailyActions = ({ insights, hasData, churnRate, revenue, pendingDecisions = 0, calibrationScore }: DailyActionsProps) => {
  if (!hasData) return null;

  const criticalInsights = filterCriticalInsights(insights);
  const warningInsights = insights.filter(i => i.severity === "medium");

  const actions: Action[] = [];

  // Generate contextual prioritized actions
  if (criticalInsights.length > 0) {
    actions.push({
      id: "investigate-critical",
      icon: AlertTriangle,
      title: "Investigate critical signals",
      description: `${criticalInsights.length} anomal${criticalInsights.length > 1 ? "ies" : "y"} detected — root cause analysis recommended`,
      path: "/diagnostics",
      cta: "Investigate",
      priority: "critical",
      color: "text-destructive",
    });
  }

  if (churnRate > 5) {
    actions.push({
      id: "retention-risk",
      icon: TrendingDown,
      title: "Review retention risk",
      description: `Churn rate at ${churnRate}% — prescriptive playbook available`,
      path: "/advisory",
      cta: "Open playbook",
      priority: "high",
      color: "text-warning",
    });
  }

  if (warningInsights.length > 0 && actions.length < 3) {
    actions.push({
      id: "review-warnings",
      icon: Eye,
      title: "Review elevated signals",
      description: `${warningInsights.length} metric${warningInsights.length > 1 ? "s" : ""} showing unusual patterns`,
      path: "/diagnostics",
      cta: "Diagnose",
      priority: "medium",
      color: "text-primary",
    });
  }

  // Proactive nudges when no urgent signals
  if (actions.length === 0 && pendingDecisions > 0) {
    actions.push({
      id: "review-pending",
      icon: BookOpen,
      title: "Review pending decisions",
      description: `${pendingDecisions} decision${pendingDecisions > 1 ? "s" : ""} awaiting outcome — log results to improve accuracy`,
      path: "/decisions",
      cta: "Update outcomes",
      priority: "medium",
      color: "text-primary",
    });
  }

  if (actions.length === 0 && calibrationScore != null && calibrationScore < 70) {
    actions.push({
      id: "improve-calibration",
      icon: Brain,
      title: "Improve your calibration",
      description: `Score at ${calibrationScore}% — log more decisions with outcomes to strengthen the model`,
      path: "/decisions",
      cta: "Log a decision",
      priority: "medium",
      color: "text-primary",
    });
  }

  const displayActions = actions.slice(0, 3);

  if (displayActions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Priority Actions Today
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {displayActions.map((action, i) => (
          <Link
            key={action.id}
            to={action.path}
            className={`group flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 ${PRIORITY_STYLES[action.priority]}`}
          >
            <div className="flex items-center justify-between">
              <action.icon className={`w-4 h-4 ${action.color}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {i + 1}/{displayActions.length}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight mb-1">{action.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{action.description}</p>
            </div>
            <span className={`text-xs font-semibold ${action.color} flex items-center gap-1 mt-auto group-hover:gap-2 transition-all`}>
              {action.cta} <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </motion.div>
  );
};

export default DailyActions;
