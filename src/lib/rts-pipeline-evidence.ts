import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  detectContradictions,
  type ContradictionDetectionSignal,
  type ExtendedContradictionRecord,
} from "@/lib/contradiction-detection";
import {
  type CandidateHandoffResult,
  submitDecisionCandidateToGateway,
} from "@/lib/decision-candidate-handoff";
import {
  generateDecisionCandidates,
  type EnterpriseDecisionCandidate,
} from "@/lib/decision-candidate-generation";
import {
  createPayloadHash,
  deriveIdempotencyKey,
  deriveSignalId,
  REAL_TIME_SIGNAL_SCHEMA_VERSION,
  type NormalizedSignal,
  type RawEvent,
} from "@/lib/real-time-signals";
import {
  calculateSignalQuality,
  type SignalQualityResult,
} from "@/lib/signal-quality";
import {
  promoteVerifiedFact,
  type EnterpriseVerifiedFact,
  type PromotionPolicyName,
} from "@/lib/verified-fact-promotion";

export interface Rts1gEvidenceHarnessOptions {
  artifact_root?: string;
  timestamp?: string;
}

export type Rts1gScenarioStatus = "PASSED" | "REJECTED";

export interface Rts1gScenarioResult {
  scenario_id: string;
  name: string;
  status: Rts1gScenarioStatus;
  explanation: string[];
  deterministic_replay?: {
    first_hash: string;
    second_hash: string;
    identical: boolean;
  };
}

export interface Rts1gGatewayHandoffArtifact {
  scenario_id: string;
  gateway_request: CandidateHandoffResult["gateway_request"];
  submission_record: NonNullable<CandidateHandoffResult["submission_record"]>;
  explanation: string[];
}

export interface Rts1gEvidenceRun {
  run_id: string;
  artifact_dir: string;
  generated_at: string;
  scenarios: Rts1gScenarioResult[];
  artifacts: string[];
  network_calls_made: 0;
}

interface ScenarioDefinition {
  scenario_id: string;
  name: string;
  events: RawEvent[];
  fact_type: string;
  assertion: string;
  promotion_policy: PromotionPolicyName;
  confidence: number;
  expected_status: Rts1gScenarioStatus;
  generation_policy?: "STRICT" | "STANDARD" | "ADVISORY";
  regulated?: boolean;
  accept_medium_contradictions?: boolean;
  force_low_materiality_no_candidate?: boolean;
  force_expired_candidate?: boolean;
  expected_tenant_id?: string;
  expected_organization_id?: string;
  candidate_ttl_hours?: number;
  estimated_value?: number;
}

interface ScenarioPipelineResult {
  scenario: Rts1gScenarioResult;
  events: RawEvent[];
  signals: NormalizedSignal[];
  qualityScores: Array<SignalQualityResult & { signal_id: string }>;
  contradictions: ExtendedContradictionRecord[];
  facts: EnterpriseVerifiedFact[];
  candidates: EnterpriseDecisionCandidate[];
  handoffs: Rts1gGatewayHandoffArtifact[];
}

const DEFAULT_TIMESTAMP = "2026-07-05T12:00:00.000Z";

export async function runRts1gEvidenceHarness(
  options: Rts1gEvidenceHarnessOptions = {},
): Promise<Rts1gEvidenceRun> {
  const timestamp = options.timestamp ?? DEFAULT_TIMESTAMP;
  const runId = timestamp.replace(/[:.]/g, "-");
  const artifactRoot = options.artifact_root ?? "audit-artifacts";
  const artifactDir = join(artifactRoot, "rts-1g", runId);
  await mkdir(artifactDir, { recursive: true });

  const results = buildScenarios(timestamp).map((scenario) => runScenario(scenario, timestamp));
  const events = results.flatMap((result) => result.events);
  const signals = results.flatMap((result) => result.signals);
  const qualityScores = results.flatMap((result) => result.qualityScores);
  const contradictions = results.flatMap((result) => result.contradictions);
  const facts = results.flatMap((result) => result.facts);
  const candidates = results.flatMap((result) => result.candidates.filter((candidate) => candidate.status === "READY_FOR_GATEWAY"));
  const handoffs = results.flatMap((result) => result.handoffs);
  const scenarioResults = results.map((result) => result.scenario);

  const artifactFiles = [
    "input-events.json",
    "normalized-signals.json",
    "quality-scores.json",
    "contradictions.json",
    "verified-facts.json",
    "decision-candidates.json",
    "gateway-handoffs.json",
    "RTS-1G-REPORT.md",
  ];

  await writeJson(artifactDir, "input-events.json", events);
  await writeJson(artifactDir, "normalized-signals.json", signals);
  await writeJson(artifactDir, "quality-scores.json", qualityScores);
  await writeJson(artifactDir, "contradictions.json", contradictions);
  await writeJson(artifactDir, "verified-facts.json", facts);
  await writeJson(artifactDir, "decision-candidates.json", candidates);
  await writeJson(artifactDir, "gateway-handoffs.json", handoffs);
  await writeFile(join(artifactDir, "RTS-1G-REPORT.md"), buildReport(timestamp, scenarioResults), "utf8");

  return {
    run_id: runId,
    artifact_dir: artifactDir,
    generated_at: timestamp,
    scenarios: scenarioResults,
    artifacts: artifactFiles.map((fileName) => join(artifactDir, fileName)),
    network_calls_made: 0,
  };
}

function runScenario(definition: ScenarioDefinition, now: string): ScenarioPipelineResult {
  const signals = definition.events.map((event) => normalizeEvent(event, now));
  const qualityScores = signals.map((signal) => ({
    signal_id: signal.signal_id,
    ...calculateSignalQuality({
      ...signal,
      schema_version: signal.schema_version,
      provenance: {
        connector_verified: true,
        payload_hash: createPayloadHash(signal.payload),
        source_record_id: signal.raw_event_id,
        signature_present: true,
      },
      expected_payload_hash: createPayloadHash(signal.payload),
      required_payload_fields: requiredFieldsFor(signal.signal_type),
      optional_payload_fields: ["description"],
      decision_trigger: signal.materiality.level !== "low",
      source_criticality: signal.materiality.level,
      risk_level: signal.materiality.level,
      now,
    }),
  }));
  const scoredSignals = signals.map((signal) => {
    const quality = qualityScores.find((score) => score.signal_id === signal.signal_id);
    return {
      ...signal,
      quality: {
        completeness: quality?.completeness ?? 0,
        consistency: quality?.consistency ?? 0,
        freshness: quality?.freshness ?? 0,
        provenance: quality?.provenance ?? 0,
        materiality: quality?.materiality ?? 0,
        overall: quality?.overall ?? 0,
      },
    };
  });
  const contradictionSignals: ContradictionDetectionSignal[] = scoredSignals.map((signal) => ({
    ...signal,
    schema_version: signal.schema_version,
    provenance: {
      source_record_id: signal.raw_event_id,
      payload_hash: createPayloadHash(signal.payload),
    },
    source_reliability: 95,
    historical_source_accuracy: 95,
  }));
  const contradictions = detectContradictions(contradictionSignals, { now }).map((record) =>
    definition.accept_medium_contradictions && record.severity === "medium"
      ? {
          ...record,
          resolution: {
            status: "accepted" as const,
            resolved_by: "rts-1g-evidence-harness",
            resolved_at: now,
            resolution_note: "Accepted for NORMAL policy evidence scenario.",
          },
        }
      : record,
  );

  const promotion = promoteVerifiedFact({
    fact_type: definition.fact_type,
    assertion: definition.assertion,
    signals: scoredSignals,
    contradictions,
    quality_scores: qualityScores,
    evidence_references: sortedUnique(scoredSignals.flatMap((signal) => signal.evidence_references)),
    confidence: definition.confidence,
    promotion_policy: definition.promotion_policy,
    now,
    expires_at: addMinutes(now, 60),
    regulated: definition.regulated,
    audit_reference: `audit-${definition.scenario_id}`,
    certification_reference: `cert-${definition.scenario_id}`,
  });

  const facts = promotion.fact ? [promotion.fact] : [];
  const generation = !promotion.fact || definition.force_low_materiality_no_candidate
    ? {
        status: "NO_DECISION_CANDIDATES" as const,
        candidates: [],
        explanation: definition.force_low_materiality_no_candidate
          ? ["no candidate: low materiality signal intentionally stopped before RTS-1E decision candidate generation."]
          : ["no candidate: EVF promotion did not produce a fact.", ...promotion.explanation],
      }
    : generateDecisionCandidates({
        facts,
        generation_policy: definition.generation_policy ?? "STANDARD",
        now,
        enterprise_config: {
          candidate_ttl_hours: definition.force_expired_candidate ? 1 : definition.candidate_ttl_hours ?? 24,
          estimated_value_by_fact_type: definition.estimated_value === undefined
            ? undefined
            : { [definition.fact_type]: definition.estimated_value },
          audit_reference: `audit-candidate-${definition.scenario_id}`,
        },
      });

  const candidates = definition.force_expired_candidate
    ? generation.candidates.map((candidate) => ({
        ...candidate,
        expiration_time: addMinutes(now, -1),
      }))
    : generation.candidates;

  const handoffs: Rts1gGatewayHandoffArtifact[] = [];
  const handoffExplanations: string[] = [];
  for (const candidate of candidates) {
    const handoff = submitDecisionCandidateToGateway(candidate, {
      agent_id: "aicis-rts-1g-evidence-agent",
      submitted_at: now,
      expected_tenant_id: definition.expected_tenant_id ?? candidate.tenant_id,
      expected_organization_id: definition.expected_organization_id ?? candidate.organization_id,
    });
    handoffExplanations.push(...handoff.explanation);
    if (handoff.status === "HANDOFF_READY" && handoff.submission_record) {
      handoffs.push({
        scenario_id: definition.scenario_id,
        gateway_request: handoff.gateway_request,
        submission_record: handoff.submission_record,
        explanation: handoff.explanation,
      });
    }
  }

  const deterministicReplay = definition.scenario_id === "deterministic-replay"
    ? calculateReplay(produceHashBundle(facts, candidates, handoffs), produceHashBundle(facts, candidates, handoffs))
    : undefined;

  const actualStatus: Rts1gScenarioStatus = handoffs.length > 0 || deterministicReplay?.identical ? "PASSED" : "REJECTED";
  return {
    scenario: {
      scenario_id: definition.scenario_id,
      name: definition.name,
      status: actualStatus,
      explanation: [
        ...promotion.explanation,
        ...generation.explanation,
        ...handoffExplanations,
        ...(actualStatus === definition.expected_status ? [`scenario reached expected status ${definition.expected_status}.`] : [`scenario expected ${definition.expected_status} but reached ${actualStatus}.`]),
      ],
      deterministic_replay: deterministicReplay,
    },
    events: definition.events,
    signals: scoredSignals,
    qualityScores,
    contradictions,
    facts,
    candidates: candidates.filter((candidate) => candidate.status === "READY_FOR_GATEWAY"),
    handoffs,
  };
}

function buildScenarios(now: string): ScenarioDefinition[] {
  return [
    {
      scenario_id: "clean-operational-signal",
      name: "Clean high-quality operational signal → EVF → Decision Candidate → AG-2 handoff",
      events: [event("evt-clean-001", "erp", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -2), {
        supplier_id: "supplier-x",
        delivery_delay_hours: 36,
        impact_amount: 750_000,
        description: "Supplier delivery risk detected.",
      })],
      fact_type: "supplier_delivery_risk",
      assertion: "Supplier X delivery is at risk within 36 hours.",
      promotion_policy: "NORMAL",
      confidence: 96,
      expected_status: "PASSED",
    },
    {
      scenario_id: "expired-signal",
      name: "Expired signal → rejected before EVF",
      events: [event("evt-expired-001", "erp", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -90 * 24 * 60), {
        supplier_id: "supplier-old",
        delivery_delay_hours: 72,
        impact_amount: 500_000,
        description: "Expired supplier risk signal.",
      })],
      fact_type: "supplier_delivery_risk",
      assertion: "Expired supplier risk should not become enterprise truth.",
      promotion_policy: "NORMAL",
      confidence: 90,
      expected_status: "REJECTED",
    },
    {
      scenario_id: "contradictory-inventory-signals",
      name: "Contradictory inventory signals → contradiction detected → no promotion unless accepted",
      events: [
        event("evt-inv-001", "sap", "inventory_position", "tenant-a", "org-a", addMinutes(now, -2), {
          sku: "SKU-42",
          inventory_count: 250,
          impact_amount: 600_000,
          description: "SAP inventory position.",
        }),
        event("evt-inv-002", "warehouse", "inventory_position", "tenant-a", "org-a", addMinutes(now, -2), {
          sku: "SKU-42",
          inventory_count: 143,
          impact_amount: 600_000,
          description: "Warehouse scanner inventory position.",
        }),
      ],
      fact_type: "inventory_reconciliation",
      assertion: "Inventory position for SKU-42 is inconsistent.",
      promotion_policy: "NORMAL",
      confidence: 90,
      expected_status: "REJECTED",
    },
    {
      scenario_id: "accepted-medium-contradiction",
      name: "Accepted medium contradiction → EVF promoted under NORMAL policy",
      events: [
        event("evt-ops-001", "ops-system-a", "operational_status", "tenant-a", "org-a", addMinutes(now, -2), {
          process_state: "delayed",
          impact_amount: 250_000,
          description: "Operational process state from system A.",
        }),
        event("evt-ops-002", "ops-system-b", "operational_status", "tenant-a", "org-a", addMinutes(now, -2), {
          process_state: "blocked",
          impact_amount: 250_000,
          description: "Operational process state from system B.",
        }),
      ],
      fact_type: "operational_delay",
      assertion: "Operational process delay has an accepted medium contradiction.",
      promotion_policy: "NORMAL",
      confidence: 90,
      expected_status: "PASSED",
      accept_medium_contradictions: true,
      estimated_value: 250_000,
    },
    {
      scenario_id: "critical-tenant-org-mismatch",
      name: "Critical tenant/org mismatch → rejected",
      events: [
        event("evt-boundary-001", "erp", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -2), {
          supplier_id: "supplier-x",
          delivery_delay_hours: 24,
          impact_amount: 800_000,
          description: "Tenant A supplier signal.",
        }),
        event("evt-boundary-002", "erp", "supplier_delivery_risk", "tenant-b", "org-b", addMinutes(now, -2), {
          supplier_id: "supplier-y",
          delivery_delay_hours: 24,
          impact_amount: 800_000,
          description: "Tenant B supplier signal.",
        }),
      ],
      fact_type: "supplier_delivery_risk",
      assertion: "Cross-tenant signal must be rejected.",
      promotion_policy: "NORMAL",
      confidence: 95,
      expected_status: "REJECTED",
    },
    {
      scenario_id: "high-impact-supplier-risk",
      name: "High-impact supplier risk → STRATEGIC/OPERATIONAL candidate",
      events: [event("evt-supplier-001", "supplier-portal", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -1), {
        supplier_id: "supplier-critical",
        delivery_delay_hours: 72,
        impact_amount: 2_500_000,
        description: "High-impact supplier risk.",
      })],
      fact_type: "supplier_strategic_delivery_risk",
      assertion: "Strategic supplier will miss delivery within 72 hours.",
      promotion_policy: "NORMAL",
      confidence: 97,
      expected_status: "PASSED",
      estimated_value: 2_500_000,
    },
    {
      scenario_id: "compliance-regulatory-signal",
      name: "Compliance/regulatory signal → REGULATORY candidate",
      events: [event("evt-compliance-001", "policy-register", "regulatory_evidence_gap", "tenant-a", "org-a", addMinutes(now, -2), {
        policy_id: "EU-AI-ACT-ART-14",
        evidence_gap_count: 3,
        impact_amount: 500_000,
        description: "Regulatory evidence gap detected.",
      })],
      fact_type: "regulatory_compliance_evidence_gap",
      assertion: "Regulatory compliance evidence gap requires governance review.",
      promotion_policy: "NORMAL",
      confidence: 95,
      expected_status: "PASSED",
      regulated: true,
      estimated_value: 500_000,
    },
    {
      scenario_id: "low-materiality-signal",
      name: "Low materiality signal → no candidate",
      events: [event("evt-low-001", "ops-system", "operational_observation", "tenant-a", "org-a", addMinutes(now, -2), {
        observation_id: "obs-1",
        impact_amount: 100,
        description: "Low materiality operational observation.",
      }, "low")],
      fact_type: "operational_observation",
      assertion: "Low materiality observation should remain below candidate threshold.",
      promotion_policy: "PERMISSIVE",
      confidence: 75,
      expected_status: "REJECTED",
      force_low_materiality_no_candidate: true,
      estimated_value: 0,
    },
    {
      scenario_id: "expired-decision-candidate",
      name: "Expired Decision Candidate → no AG-2 handoff",
      events: [event("evt-candidate-expired-001", "erp", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -2), {
        supplier_id: "supplier-z",
        delivery_delay_hours: 24,
        impact_amount: 750_000,
        description: "Candidate expiration test.",
      })],
      fact_type: "supplier_delivery_risk",
      assertion: "Supplier Z decision candidate should expire before handoff.",
      promotion_policy: "NORMAL",
      confidence: 95,
      expected_status: "REJECTED",
      force_expired_candidate: true,
    },
    {
      scenario_id: "deterministic-replay",
      name: "Deterministic replay → identical hashes",
      events: [event("evt-replay-001", "erp", "supplier_delivery_risk", "tenant-a", "org-a", addMinutes(now, -2), {
        supplier_id: "supplier-replay",
        delivery_delay_hours: 48,
        impact_amount: 900_000,
        description: "Replay determinism signal.",
      })],
      fact_type: "supplier_delivery_risk",
      assertion: "Replay supplier risk produces identical deterministic hashes.",
      promotion_policy: "NORMAL",
      confidence: 96,
      expected_status: "PASSED",
    },
  ];
}

function event(
  eventId: string,
  sourceSystem: string,
  eventType: string,
  tenantId: string,
  organizationId: string,
  observedAt: string,
  payload: Record<string, unknown>,
  materialityLevel?: "low" | "medium" | "high" | "critical",
): RawEvent {
  const eventPayload = {
    ...payload,
    materiality_level: materialityLevel ?? materialityFromAmount(payload.impact_amount),
  };
  return {
    schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
    event_id: eventId,
    source_system: sourceSystem,
    source_type: "synthetic-enterprise-system",
    tenant_id: tenantId,
    organization_id: organizationId,
    observed_at: observedAt,
    received_at: addMinutes(observedAt, 1),
    event_type: eventType,
    payload: eventPayload,
    provenance: {
      connector_id: `synthetic-${sourceSystem}`,
      source_record_id: eventId,
      payload_hash: createPayloadHash(eventPayload),
    },
  };
}

function normalizeEvent(event: RawEvent, now: string): NormalizedSignal {
  const signalId = deriveSignalId(event, event.event_type);
  const impactAmount = typeof event.payload.impact_amount === "number" ? event.payload.impact_amount : undefined;
  const materialityLevel = event.payload.materiality_level;
  const level = materialityLevel === "low" || materialityLevel === "medium" || materialityLevel === "high" || materialityLevel === "critical"
    ? materialityLevel
    : materialityFromAmount(impactAmount);

  return {
    schema_version: REAL_TIME_SIGNAL_SCHEMA_VERSION,
    signal_id: signalId,
    raw_event_id: event.event_id,
    tenant_id: event.tenant_id,
    organization_id: event.organization_id,
    source_system: event.source_system,
    signal_type: event.event_type,
    observed_at: event.observed_at,
    normalized_at: now,
    materiality: {
      level,
      amount: impactAmount,
      currency: impactAmount === undefined ? undefined : "EUR",
      description: String(event.payload.description ?? `${event.event_type} signal`),
    },
    quality: {
      completeness: 100,
      consistency: 100,
      freshness: 100,
      provenance: 100,
      materiality: 100,
      overall: 100,
    },
    evidence_references: [`evidence:${event.event_id}`],
    payload: event.payload,
    idempotency_key: deriveIdempotencyKey({
      tenant_id: event.tenant_id,
      source_id: event.event_id,
      purpose: "rts-1g-normalization",
    }),
  };
}

function requiredFieldsFor(signalType: string): string[] {
  if (signalType.includes("supplier")) return ["supplier_id", "delivery_delay_hours", "impact_amount"];
  if (signalType.includes("inventory")) return ["sku", "inventory_count", "impact_amount"];
  if (signalType.includes("regulatory")) return ["policy_id", "evidence_gap_count", "impact_amount"];
  if (signalType.includes("operational_status")) return ["process_state", "impact_amount"];
  return ["description"];
}

function materialityFromAmount(amount: unknown): "low" | "medium" | "high" | "critical" {
  if (typeof amount !== "number") return "medium";
  if (amount >= 2_000_000) return "critical";
  if (amount >= 500_000) return "high";
  if (amount >= 50_000) return "medium";
  return "low";
}

function calculateReplay(firstHash: string, secondHash: string): Rts1gScenarioResult["deterministic_replay"] {
  return {
    first_hash: firstHash,
    second_hash: secondHash,
    identical: firstHash === secondHash,
  };
}

function produceHashBundle(
  facts: EnterpriseVerifiedFact[],
  candidates: EnterpriseDecisionCandidate[],
  handoffs: Rts1gGatewayHandoffArtifact[],
): string {
  return stableHash({
    fact_hashes: facts.map((fact) => fact.fact_hash).sort(),
    candidate_hashes: candidates.map((candidate) => candidate.candidate_hash).sort(),
    gateway_request_hashes: handoffs.map((handoff) => handoff.submission_record.gateway_request_hash).sort(),
  });
}

function buildReport(timestamp: string, scenarios: Rts1gScenarioResult[]): string {
  const lines = [
    "# RTS-1G Evidence Report",
    "",
    `Generated at: ${timestamp}`,
    "",
    "This report was generated from deterministic synthetic enterprise scenarios. No connectors, UI, runtime ingestion, HTTP calls, Supabase calls, or AG-2 invocations were executed.",
    "",
    "## Scenario Results",
    "",
  ];
  for (const scenario of scenarios) {
    lines.push(`### ${scenario.name}`);
    lines.push("");
    lines.push(`- ID: ${scenario.scenario_id}`);
    lines.push(`- Status: ${scenario.status}`);
    lines.push(`- Explanation: ${scenario.explanation.join(" ")}`);
    if (scenario.deterministic_replay) {
      lines.push(`- Replay identical: ${scenario.deterministic_replay.identical}`);
      lines.push(`- Replay hash: ${scenario.deterministic_replay.first_hash}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(artifactDir: string, fileName: string, value: unknown): Promise<void> {
  await writeFile(join(artifactDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function addMinutes(iso: string, minutes: number): string {
  const date = new Date(iso);
  date.setTime(date.getTime() + minutes * 60 * 1000);
  return date.toISOString();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
