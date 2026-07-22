/**
 * Deterministic Deliberation Layer
 *
 * Computes structured perspectives on a pending decision from REAL signals:
 *   - decision_ledger row (confidence, expected value, evidence_sources)
 *   - governance_thresholds (org-specific risk thresholds)
 *   - narrative_conflicts (cross-narrative disagreement)
 *   - decision_approvals (human verdicts)
 *
 * STRICT RULES (per project memory):
 *   - No LLM personas, no synthesized prose.
 *   - No fabricated consensus score. Vote counts come from real decision_approvals.
 *   - All output uses "Label: value" anchored to source stats.
 *   - Insufficient evidence => stance: "insufficient_evidence", never "approve" by default.
 *   - Confidence is read, never invented; capped at 0.85.
 */

export type PerspectiveStance =
  | "supports"
  | "conditional"
  | "concerns"
  | "opposes"
  | "insufficient_evidence";

export interface PerspectiveFact {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}

export interface Perspective {
  id: "financial" | "risk" | "execution" | "outcome" | "contrarian";
  title: string;
  question: string;
  stance: PerspectiveStance;
  rationale: string; // deterministic, derived from facts
  facts: PerspectiveFact[];
  evidence_count: number;
}

export interface DeliberationInputs {
  decision: {
    id: string;
    recommended_action: string;
    decision_type: string;
    capped_confidence: number | null;
    raw_confidence: number | null;
    expected_value_at_decision: number | null;
    probability_of_success: number | null;
    predicted_net_impact: number | null;
    predicted_roi_probability: number | null;
    counterfactual_delta: number | null;
    causal_attribution_score: number | null;
    confidence_cap_reason: string | null;
    evidence_sources: unknown[];
    governance_context: Record<string, unknown>;
    required_approvals: number;
  };
  thresholds: Array<{ threshold_key: string; threshold_value: number }>;
  openConflicts: number;
  approvals: Array<{ verdict: string | null; status: string }>;
}

const CONFIDENCE_CAP = 0.85;

const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
const fmtNum = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString();
const fmtMoney = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `€${n.toLocaleString()}`;

function thresholdFor(thresholds: DeliberationInputs["thresholds"], key: string): number | null {
  const t = thresholds.find((x) => x.threshold_key === key);
  return t ? Number(t.threshold_value) : null;
}

export function computePerspectives(input: DeliberationInputs): Perspective[] {
  const d = input.decision;
  const confidence = Math.min(d.capped_confidence ?? d.raw_confidence ?? 0, CONFIDENCE_CAP);
  const evidenceCount = Array.isArray(d.evidence_sources) ? d.evidence_sources.length : 0;
  const minConfidence = thresholdFor(input.thresholds, "decision.min_confidence") ?? 0.6;
  const minEvidence = thresholdFor(input.thresholds, "decision.min_evidence_sources") ?? 2;
  const maxAcceptableRisk = thresholdFor(input.thresholds, "decision.max_risk") ?? 0.4;

  // ── Financial perspective ─────────────────────────
  const ev = d.expected_value_at_decision;
  const roiProb = d.predicted_roi_probability;
  const netImpact = d.predicted_net_impact;
  const financialFacts: PerspectiveFact[] = [
    { label: "Expected value at decision", value: fmtMoney(ev), tone: ev != null && ev > 0 ? "positive" : ev != null && ev < 0 ? "negative" : "neutral" },
    { label: "Predicted net impact", value: fmtMoney(netImpact) },
    { label: "ROI probability", value: fmtPct(roiProb) },
    { label: "Probability of success", value: fmtPct(d.probability_of_success) },
  ];
  let financialStance: PerspectiveStance = "insufficient_evidence";
  let financialRationale = "No expected-value model attached. Cannot evaluate financial impact.";
  if (ev != null && roiProb != null) {
    if (ev > 0 && roiProb >= 0.6) {
      financialStance = "supports";
      financialRationale = `Expected value positive (${fmtMoney(ev)}) and ROI probability ${fmtPct(roiProb)} ≥ 60% threshold.`;
    } else if (ev > 0 && roiProb >= 0.4) {
      financialStance = "conditional";
      financialRationale = `Positive expected value but ROI probability ${fmtPct(roiProb)} between 40–60%. Conditional support pending sensitivity review.`;
    } else if (ev <= 0) {
      financialStance = "opposes";
      financialRationale = `Expected value non-positive (${fmtMoney(ev)}). Financial case not established.`;
    } else {
      financialStance = "concerns";
      financialRationale = `ROI probability ${fmtPct(roiProb)} below 40%. Financial concerns outweigh upside.`;
    }
  }

  // ── Risk perspective ─────────────────────────────
  const riskScore = (1 - confidence) + (input.openConflicts * 0.05);
  const riskFacts: PerspectiveFact[] = [
    { label: "Capped confidence", value: fmtPct(confidence, 1) },
    { label: "Confidence cap reason", value: d.confidence_cap_reason ?? "none" },
    { label: "Open narrative conflicts", value: String(input.openConflicts), tone: input.openConflicts > 0 ? "warning" : "neutral" },
    { label: "Composite risk score", value: riskScore.toFixed(2), tone: riskScore > maxAcceptableRisk ? "negative" : "positive" },
    { label: "Max acceptable risk (org threshold)", value: maxAcceptableRisk.toFixed(2) },
  ];
  let riskStance: PerspectiveStance;
  let riskRationale: string;
  if (riskScore > maxAcceptableRisk + 0.2) {
    riskStance = "opposes";
    riskRationale = `Composite risk ${riskScore.toFixed(2)} exceeds org threshold ${maxAcceptableRisk.toFixed(2)} by >0.2. Risk position is opposing.`;
  } else if (riskScore > maxAcceptableRisk) {
    riskStance = "concerns";
    riskRationale = `Composite risk ${riskScore.toFixed(2)} above org threshold ${maxAcceptableRisk.toFixed(2)}. Mitigations required.`;
  } else if (input.openConflicts > 0) {
    riskStance = "conditional";
    riskRationale = `Risk within tolerance, but ${input.openConflicts} open narrative conflict(s) require resolution.`;
  } else {
    riskStance = "supports";
    riskRationale = `Composite risk ${riskScore.toFixed(2)} within org threshold ${maxAcceptableRisk.toFixed(2)}.`;
  }

  // ── Execution perspective ────────────────────────
  const executionFacts: PerspectiveFact[] = [
    { label: "Required approvals", value: String(d.required_approvals) },
    { label: "Approvals received", value: String(input.approvals.filter((a) => a.verdict === "approve").length) },
    { label: "Approvals pending", value: String(input.approvals.filter((a) => a.status === "pending").length) },
    { label: "Decision type", value: d.decision_type },
  ];
  const approvalsReceived = input.approvals.filter((a) => a.verdict === "approve").length;
  const approvalsRejected = input.approvals.filter((a) => a.verdict === "reject").length;
  let executionStance: PerspectiveStance;
  let executionRationale: string;
  if (d.required_approvals === 0) {
    executionStance = "conditional";
    executionRationale = "No approval chain configured for this decision class. Execution path undefined.";
  } else if (approvalsRejected > 0) {
    executionStance = "opposes";
    executionRationale = `${approvalsRejected} approver(s) rejected. Execution blocked.`;
  } else if (approvalsReceived >= d.required_approvals) {
    executionStance = "supports";
    executionRationale = `All ${d.required_approvals} required approvals received.`;
  } else {
    executionStance = "conditional";
    executionRationale = `${approvalsReceived}/${d.required_approvals} approvals received. Execution gated on remaining approvers.`;
  }

  // ── Outcome perspective ──────────────────────────
  const outcomeFacts: PerspectiveFact[] = [
    { label: "Causal attribution score", value: fmtPct(d.causal_attribution_score) },
    { label: "Counterfactual delta", value: fmtNum(d.counterfactual_delta) },
    { label: "Evidence sources attached", value: String(evidenceCount) },
  ];
  let outcomeStance: PerspectiveStance;
  let outcomeRationale: string;
  if (d.causal_attribution_score == null && d.counterfactual_delta == null) {
    outcomeStance = "insufficient_evidence";
    outcomeRationale = "No causal attribution or counterfactual analysis attached. Outcome reasoning cannot be evaluated.";
  } else if ((d.causal_attribution_score ?? 0) >= 0.6) {
    outcomeStance = "supports";
    outcomeRationale = `Causal attribution ${fmtPct(d.causal_attribution_score)} indicates the action drives the predicted outcome.`;
  } else {
    outcomeStance = "concerns";
    outcomeRationale = `Causal attribution ${fmtPct(d.causal_attribution_score)} below 60%. Outcome may not be attributable to this action.`;
  }

  // ── Contrarian perspective (deterministic stress test) ────────
  const contrarianIssues: string[] = [];
  if (confidence < minConfidence) contrarianIssues.push(`confidence ${fmtPct(confidence)} below org minimum ${fmtPct(minConfidence)}`);
  if (evidenceCount < minEvidence) contrarianIssues.push(`only ${evidenceCount} evidence source(s), below minimum ${minEvidence}`);
  if (input.openConflicts > 0) contrarianIssues.push(`${input.openConflicts} unresolved narrative conflict(s)`);
  if (d.confidence_cap_reason) contrarianIssues.push(`confidence capped — reason: ${d.confidence_cap_reason}`);
  if ((d.causal_attribution_score ?? 1) < 0.5) contrarianIssues.push(`weak causal attribution (${fmtPct(d.causal_attribution_score)})`);

  const contrarianFacts: PerspectiveFact[] = [
    { label: "Issues raised", value: String(contrarianIssues.length), tone: contrarianIssues.length > 0 ? "warning" : "positive" },
    { label: "Confidence vs floor", value: `${fmtPct(confidence)} vs ${fmtPct(minConfidence)} required` },
    { label: "Evidence vs floor", value: `${evidenceCount} vs ${minEvidence} required` },
  ];
  let contrarianStance: PerspectiveStance;
  let contrarianRationale: string;
  if (contrarianIssues.length === 0) {
    contrarianStance = "supports";
    contrarianRationale = "No structural objections found against decision integrity thresholds.";
  } else if (contrarianIssues.length >= 3) {
    contrarianStance = "opposes";
    contrarianRationale = `Multiple integrity issues: ${contrarianIssues.join("; ")}.`;
  } else {
    contrarianStance = "concerns";
    contrarianRationale = `Integrity issues: ${contrarianIssues.join("; ")}.`;
  }

  return [
    {
      id: "financial",
      title: "Financial Perspective",
      question: "Does expected value and ROI probability justify the action?",
      stance: financialStance,
      rationale: financialRationale,
      facts: financialFacts,
      evidence_count: [ev, roiProb, netImpact, d.probability_of_success].filter((x) => x != null).length,
    },
    {
      id: "risk",
      title: "Risk Perspective",
      question: "Is composite risk within governed tolerance?",
      stance: riskStance,
      rationale: riskRationale,
      facts: riskFacts,
      evidence_count: 1 + input.openConflicts + input.thresholds.length,
    },
    {
      id: "execution",
      title: "Execution Perspective",
      question: "Can this be executed under the configured approval chain?",
      stance: executionStance,
      rationale: executionRationale,
      facts: executionFacts,
      evidence_count: input.approvals.length,
    },
    {
      id: "outcome",
      title: "Outcome Perspective",
      question: "Is the predicted outcome attributable to this action?",
      stance: outcomeStance,
      rationale: outcomeRationale,
      facts: outcomeFacts,
      evidence_count: evidenceCount + (d.counterfactual_delta != null ? 1 : 0),
    },
    {
      id: "contrarian",
      title: "Contrarian Perspective",
      question: "What integrity issues would justify rejecting this?",
      stance: contrarianStance,
      rationale: contrarianRationale,
      facts: contrarianFacts,
      evidence_count: contrarianIssues.length,
    },
  ];
}

/** Real, non-synthesized deliberation summary. */
export interface DeliberationSummary {
  perspectives_supports: number;
  perspectives_conditional: number;
  perspectives_concerns: number;
  perspectives_opposes: number;
  perspectives_insufficient: number;
  human_approvals_received: number;
  human_approvals_required: number;
  human_rejections: number;
  status: "blocked" | "ready_for_approval" | "awaiting_approvals" | "approved" | "insufficient_evidence";
}

export function summarize(perspectives: Perspective[], input: DeliberationInputs): DeliberationSummary {
  const count = (s: PerspectiveStance) => perspectives.filter((p) => p.stance === s).length;
  const approvalsReceived = input.approvals.filter((a) => a.verdict === "approve").length;
  const approvalsRejected = input.approvals.filter((a) => a.verdict === "reject").length;

  let status: DeliberationSummary["status"];
  if (count("insufficient_evidence") >= 2) status = "insufficient_evidence";
  else if (count("opposes") >= 2 || approvalsRejected > 0) status = "blocked";
  else if (approvalsReceived >= input.decision.required_approvals && input.decision.required_approvals > 0) status = "approved";
  else if (input.decision.required_approvals > 0) status = "awaiting_approvals";
  else status = "ready_for_approval";

  return {
    perspectives_supports: count("supports"),
    perspectives_conditional: count("conditional"),
    perspectives_concerns: count("concerns"),
    perspectives_opposes: count("opposes"),
    perspectives_insufficient: count("insufficient_evidence"),
    human_approvals_received: approvalsReceived,
    human_approvals_required: input.decision.required_approvals,
    human_rejections: approvalsRejected,
    status,
  };
}
