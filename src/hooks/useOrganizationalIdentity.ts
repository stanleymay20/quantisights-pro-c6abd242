import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type OrgIdentityRow = Database["public"]["Tables"]["organizational_identity"]["Row"];
type OrgIdentityInsert = Database["public"]["Tables"]["organizational_identity"]["Insert"];
type OrgIdentityUpdate = Database["public"]["Tables"]["organizational_identity"]["Update"];

export interface OrganizationalIdentity {
  id: string;
  organization_id: string;
  vision_statement: string | null;
  mission_statement: string | null;
  core_values: string[];
  strategic_priorities: string[];
  risk_appetite: "conservative" | "moderate" | "aggressive" | "visionary";
  innovation_posture: "defender" | "balanced" | "explorer" | "disruptor";
  decision_speed_preference: "deliberate" | "balanced" | "agile" | "rapid";
  stakeholder_orientation: "shareholder" | "balanced" | "stakeholder" | "community";
  decision_principles: string[];
  ethical_boundaries: string[];
  governance_model: "centralized" | "collaborative" | "delegated" | "consensus";
  competitive_position: string | null;
  regulatory_environment: string | null;
  market_stage: "startup" | "growth" | "mature" | "turnaround" | "decline";
  industry_context: string | null;
  key_stakeholders: StakeholderEntry[];
  updated_at: string;
}

export interface StakeholderEntry {
  name: string;
  role: string;
  influence: "high" | "medium" | "low";
  interest: "high" | "medium" | "low";
}

export interface IdentityUpdateInput {
  vision_statement?: string | null;
  mission_statement?: string | null;
  core_values?: string[];
  strategic_priorities?: string[];
  risk_appetite?: string;
  innovation_posture?: string;
  decision_speed_preference?: string;
  stakeholder_orientation?: string;
  decision_principles?: string[];
  ethical_boundaries?: string[];
  governance_model?: string;
  competitive_position?: string | null;
  regulatory_environment?: string | null;
  market_stage?: string;
  industry_context?: string | null;
  key_stakeholders?: StakeholderEntry[];
}

function parseIdentity(row: OrgIdentityRow): OrganizationalIdentity {
  const asArr = (v: unknown): string[] => (Array.isArray(v) ? v : []);
  return {
    id: row.id,
    organization_id: row.organization_id,
    vision_statement: row.vision_statement,
    mission_statement: row.mission_statement,
    core_values: asArr(row.core_values),
    strategic_priorities: asArr(row.strategic_priorities),
    risk_appetite: (row.risk_appetite as OrganizationalIdentity["risk_appetite"]) ?? "moderate",
    innovation_posture: (row.innovation_posture as OrganizationalIdentity["innovation_posture"]) ?? "balanced",
    decision_speed_preference: (row.decision_speed_preference as OrganizationalIdentity["decision_speed_preference"]) ?? "balanced",
    stakeholder_orientation: (row.stakeholder_orientation as OrganizationalIdentity["stakeholder_orientation"]) ?? "balanced",
    decision_principles: asArr(row.decision_principles),
    ethical_boundaries: asArr(row.ethical_boundaries),
    governance_model: (row.governance_model as OrganizationalIdentity["governance_model"]) ?? "collaborative",
    competitive_position: row.competitive_position,
    regulatory_environment: row.regulatory_environment,
    market_stage: (row.market_stage as OrganizationalIdentity["market_stage"]) ?? "growth",
    industry_context: row.industry_context,
    key_stakeholders: (Array.isArray(row.key_stakeholders) ? row.key_stakeholders : []) as unknown as StakeholderEntry[],
    updated_at: row.updated_at,
  };
}

export const useOrganizationalIdentity = (organizationId: string | null) => {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<OrganizationalIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchIdentity = useCallback(async () => {
    if (!organizationId) {
      setIdentity(null);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("organizational_identity")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      console.error("Fetch org identity error:", error);
    }
    setIdentity(data ? parseIdentity(data) : null);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity]);

  const saveIdentity = useCallback(
    async (updates: IdentityUpdateInput) => {
      if (!organizationId || !user) throw new Error("Organization context required");
      setSaving(true);

      try {
        // Serialize complex fields to Json-compatible types
        const dbUpdates: Record<string, unknown> = { ...updates, updated_by: user.id };
        if (updates.key_stakeholders) {
          dbUpdates.key_stakeholders = JSON.parse(JSON.stringify(updates.key_stakeholders));
        }
        if (updates.core_values) {
          dbUpdates.core_values = JSON.parse(JSON.stringify(updates.core_values));
        }
        if (updates.strategic_priorities) {
          dbUpdates.strategic_priorities = JSON.parse(JSON.stringify(updates.strategic_priorities));
        }
        if (updates.decision_principles) {
          dbUpdates.decision_principles = JSON.parse(JSON.stringify(updates.decision_principles));
        }
        if (updates.ethical_boundaries) {
          dbUpdates.ethical_boundaries = JSON.parse(JSON.stringify(updates.ethical_boundaries));
        }

        if (identity) {
          const { error } = await supabase
            .from("organizational_identity")
            .update(dbUpdates as OrgIdentityUpdate)
            .eq("organization_id", organizationId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("organizational_identity")
            .insert([{
              organization_id: organizationId,
              ...dbUpdates,
            } as OrgIdentityInsert]);
          if (error) throw error;
        }
        await fetchIdentity();
      } finally {
        setSaving(false);
      }
    },
    [organizationId, user, identity, fetchIdentity]
  );

  const completenessScore = identity
    ? computeCompleteness(identity)
    : 0;

  return { identity, loading, saving, saveIdentity, completenessScore, refresh: fetchIdentity };
};

function computeCompleteness(id: OrganizationalIdentity): number {
  const checks = [
    !!id.vision_statement,
    !!id.mission_statement,
    id.core_values.length > 0,
    id.strategic_priorities.length > 0,
    !!id.risk_appetite,
    id.decision_principles.length > 0,
    !!id.competitive_position,
    !!id.industry_context,
    id.key_stakeholders.length > 0,
    id.ethical_boundaries.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function assessMissionAlignment(
  identity: OrganizationalIdentity,
  decisionType: string,
  recommendation: string
): { score: number; alignment: string; factors: string[] } {
  const factors: string[] = [];
  let score = 50; // neutral baseline

  // Risk appetite alignment
  const riskMap: Record<string, string[]> = {
    conservative: ["risk_management", "cost_optimization", "retention_strategy", "compliance", "safety"],
    moderate: ["operational_efficiency", "retention_strategy", "pricing_strategy", "cost_optimization"],
    aggressive: ["growth_strategy", "market_expansion", "investment_decision", "innovation"],
    visionary: ["market_expansion", "growth_strategy", "investment_decision", "innovation", "disruption"],
  };
  if (riskMap[identity.risk_appetite]?.includes(decisionType)) {
    score += 15;
    factors.push(`Aligns with ${identity.risk_appetite} risk appetite`);
  }

  // Anti-alignment: conservative org seeing aggressive decisions, or vice versa
  const aggressiveTypes = ["market_expansion", "growth_strategy", "investment_decision", "disruption"];
  const conservativeTypes = ["risk_management", "cost_optimization", "compliance", "safety"];
  if (identity.risk_appetite === "conservative" && aggressiveTypes.includes(decisionType)) {
    score -= 10;
    factors.push("Aggressive decision type conflicts with conservative risk appetite");
  }
  if ((identity.risk_appetite === "aggressive" || identity.risk_appetite === "visionary") && conservativeTypes.includes(decisionType)) {
    score -= 5;
    factors.push("Conservative decision type may underserve aggressive growth posture");
  }

  // Innovation posture alignment
  if (
    (identity.innovation_posture === "disruptor" || identity.innovation_posture === "explorer") &&
    (decisionType === "market_expansion" || decisionType === "growth_strategy")
  ) {
    score += 10;
    factors.push(`Matches ${identity.innovation_posture} innovation posture`);
  }
  if (identity.innovation_posture === "defender" && aggressiveTypes.includes(decisionType)) {
    score -= 8;
    factors.push("Defender posture may resist aggressive expansion");
  }

  // Stakeholder orientation alignment
  const recLower = recommendation.toLowerCase();
  if (identity.stakeholder_orientation === "community" || identity.stakeholder_orientation === "stakeholder") {
    if (recLower.includes("community") || recLower.includes("social") || recLower.includes("sustainability") || recLower.includes("employee")) {
      score += 8;
      factors.push(`Supports ${identity.stakeholder_orientation} stakeholder orientation`);
    }
    if (recLower.includes("cost cutting") || recLower.includes("layoff") || recLower.includes("downsize")) {
      score -= 10;
      factors.push(`⚠ Action conflicts with ${identity.stakeholder_orientation} orientation`);
    }
  }

  // Market stage alignment
  const stageDecisionFit: Record<string, string[]> = {
    startup: ["growth_strategy", "market_expansion", "innovation", "investment_decision"],
    growth: ["growth_strategy", "market_expansion", "operational_efficiency", "retention_strategy"],
    mature: ["cost_optimization", "operational_efficiency", "retention_strategy", "risk_management"],
    turnaround: ["cost_optimization", "risk_management", "retention_strategy"],
    decline: ["cost_optimization", "risk_management", "retention_strategy"],
  };
  if (stageDecisionFit[identity.market_stage]?.includes(decisionType)) {
    score += 8;
    factors.push(`Fits ${identity.market_stage} market stage priorities`);
  }

  // Governance model — consensus orgs need more time for group decisions
  if (identity.governance_model === "consensus" && recLower.includes("immediate")) {
    score -= 5;
    factors.push("Consensus governance may slow immediate action recommendations");
  }

  // Values alignment — check if recommendation text mentions any core values
  for (const value of identity.core_values) {
    if (recLower.includes(value.toLowerCase())) {
      score += 5;
      factors.push(`References core value: ${value}`);
    }
  }

  // Strategic priorities alignment
  for (const priority of identity.strategic_priorities) {
    if (recLower.includes(priority.toLowerCase())) {
      score += 10;
      factors.push(`Supports strategic priority: ${priority}`);
    }
  }

  // Ethical boundaries check — CRITICAL: these are hard flags
  for (const boundary of identity.ethical_boundaries) {
    if (recLower.includes(boundary.toLowerCase())) {
      score -= 20;
      factors.push(`⚠ Touches ethical boundary: ${boundary}`);
    }
  }

  // Decision principles alignment
  for (const principle of identity.decision_principles) {
    if (recLower.includes(principle.toLowerCase())) {
      score += 5;
      factors.push(`Upholds decision principle: ${principle}`);
    }
  }

  // Vision/mission keyword alignment
  if (identity.vision_statement) {
    const visionWords = identity.vision_statement.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const matchedVision = visionWords.filter(w => recLower.includes(w));
    if (matchedVision.length >= 2) {
      score += 7;
      factors.push("Aligns with organizational vision themes");
    }
  }
  if (identity.mission_statement) {
    const missionWords = identity.mission_statement.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const matchedMission = missionWords.filter(w => recLower.includes(w));
    if (matchedMission.length >= 2) {
      score += 7;
      factors.push("Aligns with organizational mission themes");
    }
  }

  score = Math.max(0, Math.min(100, score));

  const alignment =
    score >= 75 ? "Strong alignment" :
    score >= 50 ? "Moderate alignment" :
    score >= 25 ? "Weak alignment" :
    "Misaligned";

  return { score, alignment, factors };
}
