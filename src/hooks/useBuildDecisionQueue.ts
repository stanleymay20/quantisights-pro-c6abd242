import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeCostOfDelay, type CostOfDelayResult, type CostOfDelayInput } from "@/lib/cost-of-delay";
import { generateRecommendation, type StructuredRecommendation } from "@/lib/decision-recommendation";
import type { Insight } from "@/hooks/useInsights";
import { assessMissionAlignment, type OrganizationalIdentity } from "@/hooks/useOrganizationalIdentity";

export interface EnrichedDecision {
  id: string;
  type: "signal" | "advisory" | "pending_outcome" | "proactive";
  urgency: "critical" | "high" | "medium";
  title: string;
  context: string;
  recommendedAction: string;
  confidence?: number;
  source: string;
  sourceId?: string;
  timeframe?: string;
  riskIfIgnored: "high" | "medium" | "low";
  createdAt?: string;
  costOfDelayResult: CostOfDelayResult;
  recommendation: StructuredRecommendation;
  rawConfidence?: number | null;
  cappedConfidence?: number | null;
  confidenceCapReason?: string | null;
  generatedAt: string;
  sampleSize?: number;
  /** Dataset this decision originated from (for ledger provenance) */
  sourceDatasetId?: string | null;
  /** Mission alignment scoring (computed if org identity exists) */
  missionAlignment?: { score: number; alignment: string; factors: string[]; ethicalConflict: boolean } | null;
}

interface UseBuildDecisionQueueArgs {
  organizationId: string;
  insights: Insight[];
  churnRate: number;
  revenue: number;
  pendingDecisions: number;
  calibrationScore: number | null;
  datasetId?: string;
  identity?: OrganizationalIdentity | null;
}

function ageDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

export function useBuildDecisionQueue({
  organizationId,
  insights,
  churnRate,
  revenue,
  pendingDecisions,
  calibrationScore,
  datasetId,
  identity,
}: UseBuildDecisionQueueArgs) {
  const [decisions, setDecisions] = useState<EnrichedDecision[]>([]);
  const [loading, setLoading] = useState(true);

  // Debounce ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highSeverityInsights = useMemo(
    () => insights.filter(i => i.severity === "high" || i.severity === "critical"),
    [insights]
  );

  const orgIdentityContext = useMemo(() => {
    if (!identity) return undefined;
    return {
      riskAppetite: identity.risk_appetite,
      decisionSpeedPreference: identity.decision_speed_preference,
      governanceModel: identity.governance_model,
      stakeholderOrientation: identity.stakeholder_orientation,
      marketStage: identity.market_stage,
      strategicPriorities: identity.strategic_priorities,
    };
  }, [identity]);

  const buildQueue = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const queue: EnrichedDecision[] = [];
    const now = new Date().toISOString();

    // Track advisory source signal IDs for deduplication
    const advisorySourceSignalIds = new Set<string>();

    // 1. Open advisories (dataset-scoped — skip if no dataset to prevent cross-workspace leakage)
    let advisories: any[] | null = null;
    if (datasetId) {
      const { data } = await supabase
        .from("advisory_instances")
        .select("id, title, action, priority, confidence, capped_confidence, confidence_cap_reason, category, timeframe, expected_impact, created_at, raw_confidence, impact_score, dataset_id")
        .eq("organization_id", organizationId)
        .eq("dataset_id", datasetId)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(3);
      advisories = data;
    }

    advisories?.forEach(adv => {
      // Track for dedup (advisory IDs could match signal IDs if spawned from them)
      if (adv.id) advisorySourceSignalIds.add(adv.id);

      const sev = adv.priority === "critical" ? "critical" : adv.priority === "high" ? "high" : "medium";
      const age = ageDays(adv.created_at);

      const codResult = computeCostOfDelay({
        severity: sev as CostOfDelayInput["severity"],
        confidence: (adv.capped_confidence ?? adv.confidence) as number | null,
        cappedConfidence: adv.capped_confidence as number | null,
        affectedMetricType: adv.category,
        predictedNetImpact: null,
        revenue,
        ageDays: age,
        expectedImpact: adv.expected_impact,
      });

      const rec = generateRecommendation({
        signalType: "advisory",
        category: adv.category,
        severity: sev,
        confidence: (adv.capped_confidence ?? adv.confidence) as number | null,
        priorAdvisoryAction: adv.action,
        message: adv.title,
        sampleSize: undefined,
        datasetId: adv.dataset_id ?? datasetId,
        orgIdentity: orgIdentityContext,
      });

      queue.push({
        id: `advisory-${adv.id}`,
        type: "advisory",
        urgency: sev === "critical" ? "critical" : sev === "high" ? "high" : "medium",
        title: adv.title,
        context: adv.action,
        recommendedAction: rec.recommendedAction,
        confidence: (adv.capped_confidence ?? adv.confidence) as number | undefined,
        source: `${adv.category} Advisory`,
        sourceId: adv.id,
        timeframe: adv.timeframe ?? undefined,
        costOfDelayResult: codResult,
        recommendation: rec,
        riskIfIgnored: codResult.label === "critical" || codResult.label === "high" ? "high" : "medium",
        createdAt: adv.created_at,
        rawConfidence: (adv.raw_confidence ?? adv.confidence) as number | null,
        cappedConfidence: adv.capped_confidence as number | null,
        confidenceCapReason: adv.confidence_cap_reason,
        generatedAt: now,
        sourceDatasetId: adv.dataset_id ?? datasetId ?? null,
      });
    });

    // 2. High-severity signals (skip if already covered by an advisory)
    highSeverityInsights
      .filter(insight => !advisorySourceSignalIds.has(insight.id))
      .slice(0, 2)
      .forEach(insight => {
        const severity: "critical" | "high" = insight.severity === "critical" ? "critical" : "high";
        const age = ageDays(insight.created_at);
        const hasCappedConf = insight.capped_confidence != null;

        const codResult = computeCostOfDelay({
          severity,
          confidence: insight.capped_confidence ?? insight.confidence_score ?? null,
          cappedConfidence: insight.capped_confidence ?? null,
          affectedMetricType: insight.category,
          signalDelta: insight.variance_score ?? null,
          revenue,
          ageDays: age,
          trendAccelerating: insight.message?.toLowerCase().includes("accelerat") ?? false,
        });

        const rec = generateRecommendation({
          signalType: "signal",
          metricType: insight.category,
          trendDirection: (insight.message?.toLowerCase().includes("decline") || insight.message?.toLowerCase().includes("drop")) ? "down" : "stable",
          severity,
          confidence: insight.capped_confidence ?? insight.confidence_score ?? null,
          message: insight.message,
          category: insight.category,
          sampleSize: insight.sample_size ?? undefined,
          calibrationApplied: hasCappedConf,
          datasetId: datasetId,
          orgIdentity: orgIdentityContext,
        });

        queue.push({
          id: `signal-${insight.id}`,
          type: "signal",
          urgency: codResult.label === "critical" ? "critical" : "high",
          title: rec.whatHappened,
          context: insight.message?.slice(0, 160) || "Critical signal detected",
          recommendedAction: rec.recommendedAction,
          confidence: insight.capped_confidence ?? insight.confidence_score,
          source: insight.category ? `${insight.category} Diagnostics` : "Diagnostic Engine",
          sourceId: insight.id,
          costOfDelayResult: codResult,
          recommendation: rec,
          riskIfIgnored: codResult.label === "critical" || codResult.label === "high" ? "high" : "medium",
          createdAt: insight.created_at,
          rawConfidence: insight.confidence_score ?? null,
          cappedConfidence: insight.capped_confidence ?? null,
          confidenceCapReason: insight.confidence_cap_reason ?? null,
          generatedAt: now,
          sampleSize: insight.sample_size ?? undefined,
          sourceDatasetId: datasetId ?? null,
        });
      });

    // 3. Pending outcomes (org-scoped by design — institutional memory)
    if (pendingDecisions > 0) {
      const { data: pending } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, confidence_at_decision, raw_confidence, capped_confidence, confidence_cap_reason, created_at, decision_type")
        .eq("organization_id", organizationId)
        .eq("execution_status", "not_started")
        .eq("is_suppressed", false)
        .order("created_at", { ascending: false })
        .limit(2);

      pending?.forEach(dec => {
        const days = ageDays(dec.created_at);
        const sev: CostOfDelayInput["severity"] = days > 45 ? "high" : days > 21 ? "medium" : "low";

        const codResult = computeCostOfDelay({
          severity: sev,
          confidence: dec.confidence_at_decision,
          ageDays: days,
          revenue,
        });

        const rec = generateRecommendation({
          signalType: "pending_outcome",
          severity: sev,
          confidence: dec.confidence_at_decision,
          message: dec.recommended_action,
          category: dec.decision_type,
          sampleSize: 0,
          orgIdentity: orgIdentityContext,
        });

        queue.push({
          id: `pending-${dec.id}`,
          type: "pending_outcome",
          urgency: days > 30 ? "high" : "medium",
          title: dec.recommended_action?.slice(0, 80) || "Decision awaiting outcome",
          context: `Logged ${days}d ago · ${dec.decision_type} · ${dec.confidence_at_decision ?? "?"}% confidence at decision time`,
          recommendedAction: rec.recommendedAction,
          source: "Decision Ledger",
          sourceId: dec.id,
          costOfDelayResult: codResult,
          recommendation: rec,
          riskIfIgnored: days > 45 ? "high" : days > 21 ? "medium" : "low",
          createdAt: dec.created_at,
          rawConfidence: dec.raw_confidence,
          cappedConfidence: dec.capped_confidence,
          confidenceCapReason: dec.confidence_cap_reason,
          generatedAt: now,
        });
      });
    }

    // 4. Proactive: churn (heuristic — labeled)
    if (churnRate > 5 && queue.length < 5) {
      const sev: CostOfDelayInput["severity"] = churnRate > 12 ? "critical" : churnRate > 8 ? "high" : "medium";
      const heuristicConf = Math.min(60, Math.round(40 + churnRate));

      const codResult = computeCostOfDelay({
        severity: sev,
        confidence: heuristicConf,
        affectedMetricType: "churn",
        revenue,
        trendAccelerating: churnRate > 10,
      });

      const rec = generateRecommendation({
        signalType: "proactive",
        metricType: "churn",
        trendDirection: "up",
        severity: sev,
        confidence: heuristicConf,
        category: "retention",
        sampleSize: 0,
        orgIdentity: orgIdentityContext,
      });

      queue.push({
        id: "proactive-churn",
        type: "proactive",
        urgency: sev === "critical" ? "critical" : "high",
        title: `Attrition risk: ${churnRate.toFixed(1)}% loss rate ${churnRate > 10 ? "— exceeds critical threshold" : "— above target"}`,
        context: `Loss rate at ${churnRate.toFixed(1)}% compounds over time, eroding base capacity and revenue. Confidence is heuristic (threshold-based).`,
        recommendedAction: rec.recommendedAction,
        source: "Proactive Intelligence",
        costOfDelayResult: codResult,
        recommendation: rec,
        riskIfIgnored: "high",
        generatedAt: now,
        rawConfidence: heuristicConf,
        cappedConfidence: null,
        confidenceCapReason: "Heuristic confidence: threshold-based proactive signal, not model-derived",
        sampleSize: 0, // No sample — heuristic
      });
    }

    // 5. Proactive: calibration
    if (calibrationScore != null && calibrationScore < 65 && queue.length < 5) {
      const sev: CostOfDelayInput["severity"] = calibrationScore < 40 ? "high" : "medium";

      const codResult = computeCostOfDelay({
        severity: sev,
        confidence: calibrationScore,
        ageDays: 0,
        revenue,
      });

      const rec = generateRecommendation({
        signalType: "proactive",
        category: "calibration",
        severity: sev,
        confidence: calibrationScore,
        message: `Calibration at ${calibrationScore}% — ${65 - calibrationScore}pp below governance threshold`,
        sampleSize: 0,
        orgIdentity: orgIdentityContext,
      });

      queue.push({
        id: "proactive-calibration",
        type: "proactive",
        urgency: sev === "high" ? "high" : "medium",
        title: `Decision calibration at ${calibrationScore}% — ${65 - calibrationScore}pp below threshold`,
        context: `Team calibration score is ${calibrationScore}% (target: ≥65%). ${pendingDecisions > 0 ? `${pendingDecisions} outcomes awaiting closure.` : ""}`,
        recommendedAction: rec.recommendedAction,
        source: "Calibration Engine",
        costOfDelayResult: codResult,
        recommendation: rec,
        riskIfIgnored: sev === "high" ? "high" : "medium",
        generatedAt: now,
        rawConfidence: calibrationScore,
        cappedConfidence: null,
        confidenceCapReason: null,
        sampleSize: 0, // No sample — calibration metric
      });
    }

    // --- Mission alignment scoring ---
    if (identity) {
      for (const item of queue) {
        const decisionType = item.type === "advisory" ? "risk_management" :
          item.type === "proactive" ? (item.id.includes("churn") ? "retention_strategy" : "calibration") :
          "general";
        const alignment = assessMissionAlignment(identity, decisionType, item.recommendation.recommendedAction);
        const ethicalConflict = alignment.factors.some(f => f.startsWith("⚠"));
        item.missionAlignment = { ...alignment, ethicalConflict };

        // Boost CoD score for strongly aligned decisions (org priorities match)
        if (alignment.score >= 75) {
          item.costOfDelayResult = {
            ...item.costOfDelayResult,
            score: Math.min(100, item.costOfDelayResult.score + 8),
            reason: item.costOfDelayResult.reason + " · strong mission alignment",
          };
        }

        // Demote misaligned decisions & flag ethical conflicts
        if (alignment.score < 25 || ethicalConflict) {
          item.costOfDelayResult = {
            ...item.costOfDelayResult,
            score: Math.max(0, item.costOfDelayResult.score - 10),
            reason: item.costOfDelayResult.reason + (ethicalConflict ? " · ⚠ ethical boundary conflict" : " · weak mission alignment"),
          };
        }

        // Adjust urgency based on risk appetite alignment
        if (identity.risk_appetite === "conservative" && item.urgency === "medium" && alignment.score >= 60) {
          // Conservative orgs should pay more attention to moderate risks that align with their mission
          item.costOfDelayResult = {
            ...item.costOfDelayResult,
            score: Math.min(100, item.costOfDelayResult.score + 5),
          };
        }
        if (identity.decision_speed_preference === "rapid" || identity.decision_speed_preference === "agile") {
          // Reduce action window for fast-moving orgs
          item.costOfDelayResult = {
            ...item.costOfDelayResult,
            recommendedActionWindowDays: Math.max(1, item.costOfDelayResult.recommendedActionWindowDays - 2),
          };
        }
      }
    }

    queue.sort((a, b) => {
      // Ethical conflicts always sort last (flag, don't auto-act)
      const aEthical = a.missionAlignment?.ethicalConflict ? 1 : 0;
      const bEthical = b.missionAlignment?.ethicalConflict ? 1 : 0;
      if (aEthical !== bEthical) return aEthical - bEthical;

      if (b.costOfDelayResult.score !== a.costOfDelayResult.score) {
        return b.costOfDelayResult.score - a.costOfDelayResult.score;
      }
      const urgencyOrder = { critical: 0, high: 1, medium: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    setDecisions(queue.slice(0, 5));
    setLoading(false);
  }, [organizationId, highSeverityInsights, churnRate, revenue, pendingDecisions, calibrationScore, datasetId, identity, orgIdentityContext]);

  // Debounced effect — 200ms
  useEffect(() => {
    if (!organizationId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      buildQueue();
    }, 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [buildQueue]);

  return { decisions, setDecisions, loading };
}
