import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, TrendingDown, Info, Clock, User, CalendarDays, Gauge } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Insight } from "@/hooks/useInsights";

interface HeroInsightProps {
  insights: Insight[];
}

/** Category-specific actions with severity-aware tone, consequence language, and confidence drivers */
const CATEGORY_INTEL: Record<string, {
  high: string;
  medium: string;
  impact: string;
  inaction: string;
  strength: "strong" | "moderate";
  confidenceDrivers: string[];
  confidenceLimiters: string[];
  owner: string;
}> = {
  revenue: {
    high: "Shift 15–20% spend from lowest-converting channels → top-2 segments showing 3× ROI delta",
    medium: "Review channel-level ROI variance and flag segments with declining conversion for rebalancing",
    impact: "5–15% at-risk revenue recovery potential",
    inaction: "At current trajectory, revenue leakage will compound by an estimated 2–3% per quarter if unaddressed",
    strength: "strong",
    confidenceDrivers: ["multi-period revenue trend", "segment-level conversion data"],
    confidenceLimiters: ["attribution model completeness", "channel-level granularity"],
    owner: "VP Revenue / CRO",
  },
  churn: {
    high: "Activate retention playbook for top-decile risk cohort — onboarding friction is primary driver",
    medium: "Analyze retention by cohort vintage and assess onboarding completion correlation",
    impact: "2–4pp churn reduction potential over next quarter",
    inaction: "Without intervention, projected churn increase will erode customer base by 8–12% annually",
    strength: "strong",
    confidenceDrivers: ["cohort survival data", "onboarding completion rates"],
    confidenceLimiters: ["customer feedback data availability"],
    owner: "VP Customer Success",
  },
  cost: {
    high: "Audit top-3 cost centers by ROI rank — cut or pause spend lines with negative marginal return",
    medium: "Review cost center efficiency ratios and flag lines with declining unit economics",
    impact: "8–12% operating margin improvement potential",
    inaction: "Continued spend on negative-ROI lines will suppress operating margin by an estimated 3–5pp over 2 quarters",
    strength: "moderate",
    confidenceDrivers: ["cost center allocation data", "ROI tracking"],
    confidenceLimiters: ["indirect cost attribution accuracy"],
    owner: "VP Finance / CFO",
  },
  growth: {
    high: "Double investment in top-performing acquisition channel (2.8× avg CAC efficiency) and cut bottom-2",
    medium: "Assess acquisition channel CAC-to-LTV ratios and model reallocation scenarios",
    impact: "10–20% growth acceleration potential",
    inaction: "Current channel mix inefficiency is suppressing growth rate by an estimated 15–25% vs optimal allocation",
    strength: "strong",
    confidenceDrivers: ["CAC-to-LTV ratios", "channel performance history"],
    confidenceLimiters: ["market saturation data"],
    owner: "VP Growth / CGO",
  },
  margin: {
    high: "Reprice bottom-quartile product lines and renegotiate top-3 supplier contracts by volume leverage",
    medium: "Review product line margin distribution and identify renegotiation leverage points",
    impact: "3–5pp gross margin improvement potential",
    inaction: "Margin compression will continue at current rate, reducing gross margin by ~1–2pp per quarter",
    strength: "moderate",
    confidenceDrivers: ["product-level margin data", "supplier contract terms"],
    confidenceLimiters: ["competitive pricing intelligence"],
    owner: "CFO / VP Finance",
  },
  conversion: {
    high: "Deploy targeted fix at Stage 3 drop-off (highest volume loss) — A/B test within 2 weeks",
    medium: "Map conversion funnel by stage and quantify volume loss at each transition point",
    impact: "15–25% conversion lift potential",
    inaction: "Stage 3 drop-off is currently losing an estimated 18–22% of qualified pipeline volume each period",
    strength: "strong",
    confidenceDrivers: ["funnel stage tracking", "volume-per-stage data"],
    confidenceLimiters: ["user behavior tracking depth"],
    owner: "VP Growth / Head of Product",
  },
  operational: {
    high: "Resolve primary bottleneck in processing pipeline (37% of total cycle time) within 30 days",
    medium: "Profile process stages by throughput variance and model bottleneck elimination scenarios",
    impact: "20–30% cycle time reduction potential",
    inaction: "Bottleneck will continue consuming 35–40% of total cycle time, limiting throughput capacity",
    strength: "moderate",
    confidenceDrivers: ["process stage timing data", "throughput measurements"],
    confidenceLimiters: ["upstream dependency visibility"],
    owner: "COO / VP Operations",
  },
};

const DEFAULT_INTEL = {
  high: "Apply corrective measures to root cause identified in signal — prioritize by impact magnitude",
  medium: "Assess root cause drivers and model corrective scenarios ranked by expected ROI",
  impact: "Downside exposure mitigation within 30–60 days",
  inaction: "Continued inaction on this signal increases downside exposure over the next 60–90 days",
  strength: "moderate" as const,
  confidenceDrivers: ["pattern analysis"],
  confidenceLimiters: ["data completeness"],
  owner: "Decision Owner (assign)",
};

interface DerivedIntel {
  action: string;
  impact: string;
  inaction: string;
  strength: "strong" | "moderate";
  confidenceDrivers: string[];
  confidenceLimiters: string[];
  owner: string;
  timeframeDays: number;
}

function deriveIntel(category: string | null, severity: string): DerivedIntel {
  const isHigh = severity === "high";
  const timeframeDays = isHigh ? 7 : 14;
  if (category) {
    const key = category.toLowerCase();
    for (const [k, v] of Object.entries(CATEGORY_INTEL)) {
      if (key.includes(k)) return {
        action: isHigh ? v.high : v.medium,
        impact: v.impact,
        inaction: v.inaction,
        strength: isHigh ? v.strength : "moderate",
        confidenceDrivers: v.confidenceDrivers,
        confidenceLimiters: v.confidenceLimiters,
        owner: v.owner,
        timeframeDays,
      };
    }
  }
  return {
    action: isHigh ? DEFAULT_INTEL.high : DEFAULT_INTEL.medium,
    impact: DEFAULT_INTEL.impact,
    inaction: DEFAULT_INTEL.inaction,
    strength: DEFAULT_INTEL.strength,
    confidenceDrivers: DEFAULT_INTEL.confidenceDrivers,
    confidenceLimiters: DEFAULT_INTEL.confidenceLimiters,
    owner: DEFAULT_INTEL.owner,
    timeframeDays,
  };
}

/** Derive a reasoning line explaining WHY this recommendation was generated */
function deriveReasoning(insight: Insight): string {
  const parts: string[] = [];
  if (insight.category) parts.push(`${insight.category.replace(/_/g, " ")} signal detected`);
  if (insight.sample_size) parts.push(`${insight.sample_size} data points analyzed`);
  // variance_score and data_quality_index are already 0-100 scale, not 0-1
  // fractions -- see InsightEvidencePanel.tsx for the same fix and why.
  if (insight.variance_score != null && insight.variance_score > 30) parts.push("high variance observed");
  if (insight.data_quality_index != null) parts.push(`data quality: ${Math.round(insight.data_quality_index)}%`);
  return parts.length > 0
    ? `Based on: ${parts.join(" · ")}`
    : "Based on: pattern analysis across available metrics";
}

/** Build confidence explanation showing what drives and limits it */
function buildConfidenceExplanation(confidence: number, intel: DerivedIntel, insight: Insight): string {
  const drivers = intel.confidenceDrivers.join(", ");
  const limiters: string[] = [...intel.confidenceLimiters];
  if (insight.sample_size != null && insight.sample_size < 30) limiters.unshift("limited sample size");
  if (insight.data_quality_index != null && insight.data_quality_index < 70) limiters.unshift("data quality below threshold");
  const limiterStr = limiters.length > 0 ? ` · Limited by: ${limiters.join(", ")}` : "";
  return `${Math.round(confidence)}% — Driven by: ${drivers}${limiterStr}`;
}

/** Derive execution readiness from data quality signals */
function deriveExecutionReadiness(insight: Insight, confidence: number): { level: string; reason: string } {
  const sample = insight.sample_size ?? 0;
  const dqi = insight.data_quality_index ?? 50;
  if (confidence >= 70 && sample >= 30 && dqi >= 70) return { level: "High", reason: "Strong data foundation" };
  const gaps: string[] = [];
  if (confidence < 70) gaps.push("moderate confidence");
  if (sample < 30) gaps.push("limited sample");
  if (dqi < 70) gaps.push("data quality gaps");
  if (gaps.length <= 1) return { level: "Moderate", reason: `Actionable, limited by: ${gaps[0] ?? "data coverage"}` };
  return { level: "Low", reason: `Requires: ${gaps.join(", ")}` };
}

const READINESS_STYLES: Record<string, string> = {
  High: "text-success",
  Moderate: "text-warning",
  Low: "text-destructive",
};

const HeroInsight = memo(({ insights }: HeroInsightProps) => {
  const navigate = useNavigate();
  const topInsight = insights.find(i => i.severity === "high") || insights.find(i => i.severity === "medium");

  const intel = useMemo(
    () => topInsight ? deriveIntel(topInsight.category, topInsight.severity) : null,
    [topInsight?.category, topInsight?.severity]
  );

  if (!topInsight || !intel) return null;

  const confidence = topInsight.capped_confidence ?? topInsight.raw_confidence ?? topInsight.confidence_score ?? 0;
  const reasoning = deriveReasoning(topInsight);
  const confidenceExplanation = buildConfidenceExplanation(confidence, intel, topInsight);
  const readiness = deriveExecutionReadiness(topInsight, confidence);

  const severityStyles = topInsight.severity === "high"
    ? "border-destructive/30 bg-destructive/[0.05] hover:bg-destructive/[0.08] hover:border-destructive/40"
    : "border-warning/30 bg-warning/[0.05] hover:bg-warning/[0.08] hover:border-warning/40";
  const accentColor = topInsight.severity === "high" ? "text-destructive" : "text-warning";
  const iconBg = topInsight.severity === "high" ? "bg-destructive/15 group-hover:bg-destructive/20" : "bg-warning/15 group-hover:bg-warning/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
      className={`rounded-xl border p-3 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 cursor-pointer transition-all shadow-sm hover:shadow-md group ${severityStyles}`}
      onClick={() => navigate("/diagnostics")}
    >
      <div className="flex items-start gap-3 sm:contents">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors ${iconBg}`}>
          <AlertTriangle className={`w-4 h-4 sm:w-5 sm:h-5 ${accentColor}`} />
        </div>
        <div className="flex-1 min-w-0 sm:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${accentColor}`}>
              {intel.strength === "strong" ? "Strong Signal" : "Signal"}
            </p>
            {confidence > 0 && <ConfidenceBadge confidence={confidence} className="text-[10px]" />}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {/* Desktop header */}
        <div className="hidden sm:flex items-center gap-2 mb-1.5 flex-wrap">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${accentColor}`}>
            {intel.strength === "strong" ? "Strong Signal" : "Signal"}
          </p>
          {confidence > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span><ConfidenceBadge confidence={confidence} className="text-[10px]" /></span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs p-3">
                <p className="font-medium mb-1">Confidence Breakdown</p>
                <p className="text-muted-foreground">{confidenceExplanation}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-[13px] sm:text-sm font-semibold text-foreground leading-snug line-clamp-2">{topInsight.message}</p>
        
        {/* Recommended action */}
        <p className="text-[11px] sm:text-xs text-primary font-medium mt-1 sm:mt-1.5 line-clamp-2">
          → {intel.action}
        </p>
        
        {/* Estimated impact — single line */}
        <p className="text-[11px] text-muted-foreground mt-1">
          Impact: {intel.impact}
        </p>

        {/* Consequence of inaction — hidden on mobile */}
        <div className="hidden sm:flex items-start gap-1.5 mt-1.5">
          <Clock className="w-3 h-3 text-muted-foreground/60 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground/70 italic leading-snug">
            If unaddressed: {intel.inaction}
          </p>
        </div>

        {/* Execution metadata — compact on mobile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap mt-2 pt-2 border-t border-border/20">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <User className="w-2.5 h-2.5" /> <span className="font-semibold text-foreground">{intel.owner}</span>
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarDays className="w-2.5 h-2.5" /> {intel.timeframeDays}d
          </span>
          <span className={`text-[10px] flex items-center gap-1 ${READINESS_STYLES[readiness.level] ?? "text-muted-foreground"}`}>
            <Gauge className="w-2.5 h-2.5" />
            <span className="font-semibold">{readiness.level}</span>
          </span>
        </div>

        {/* Reasoning + evidence — hidden on mobile */}
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 hidden sm:block">{reasoning}</p>
        {topInsight.category && (
          <div className="hidden sm:flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                {topInsight.category.replace(/_/g, " ")} · Full evidence chain available
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/40 italic">
              Recommendation improves with each measured outcome
            </span>
          </div>
        )}
      </div>
      {/* Resolve: bottom CTA on mobile, side on desktop */}
      <span className={`hidden sm:flex shrink-0 items-center gap-1 text-[11px] font-semibold mt-1 opacity-70 group-hover:opacity-100 transition-opacity ${accentColor}`}>
        Resolve <ArrowRight className="w-3.5 h-3.5" />
      </span>
      <div className={`sm:hidden flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs ${accentColor} bg-background/60 border border-current/20 mt-1`}>
        Resolve <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </motion.div>
  );
});

HeroInsight.displayName = "HeroInsight";

export default HeroInsight;
