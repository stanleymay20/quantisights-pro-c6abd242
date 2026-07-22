// tests/evidence/pipelines/lib/ai-controls.mjs
// EE-5 control registry for mocked AI recommendation, explanation, and
// confidence evidence. These controls consume mocked evidence only.

export const AI_CONTROLS = Object.freeze([
  {
    control_id: "AI-001",
    title: "AI recommendation is generated in mocked evidence mode",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "AI_RECOMMENDATION_MISSING",
    recommendation: "Provide mocked recommendation evidence before certification.",
  },
  {
    control_id: "AI-002",
    title: "AI explanation is generated and structured",
    pipeline: "ai-explanation",
    severity: "security_failure",
    failure_code: "AI_EXPLANATION_MISSING",
    recommendation: "Provide structured explanation evidence before certification.",
  },
  {
    control_id: "AI-003",
    title: "Confidence score is stored",
    pipeline: "confidence-scoring",
    severity: "security_failure",
    failure_code: "CONFIDENCE_SCORE_MISSING",
    recommendation: "Persist confidence score evidence before certification.",
  },
  {
    control_id: "AI-004",
    title: "Confidence score is bounded 0-100",
    pipeline: "confidence-scoring",
    severity: "critical_failure",
    failure_code: "CONFIDENCE_SCORE_OUT_OF_BOUNDS",
    recommendation: "Clamp/validate confidence scores to the 0-100 contract.",
  },
  {
    control_id: "AI-005",
    title: "AI citations are preserved",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "AI_CITATION_PRESERVATION_FAILURE",
    recommendation: "Preserve source citation IDs and quote hashes.",
  },
  {
    control_id: "AI-006",
    title: "Malformed AI responses fail closed",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "MALFORMED_AI_RESPONSE_ACCEPTED",
    recommendation: "Reject malformed AI responses before persistence.",
  },
  {
    control_id: "AI-007",
    title: "AI timeout path is handled",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "AI_TIMEOUT_NOT_HANDLED",
    recommendation: "Return deterministic fallback/insufficient-data response on timeout.",
  },
  {
    control_id: "AI-008",
    title: "AI 429/rate-limit path is handled",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "AI_RATE_LIMIT_NOT_HANDLED",
    recommendation: "Handle provider 429 without fabricating recommendations.",
  },
  {
    control_id: "AI-009",
    title: "Fallback behavior is deterministic",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "AI_FALLBACK_FAILURE",
    recommendation: "Ensure fallback behavior is explicit, deterministic, and evidenced.",
  },
  {
    control_id: "AI-010",
    title: "Hallucination guard detects missing citations",
    pipeline: "ai-recommendation",
    severity: "critical_failure",
    failure_code: "AI_HALLUCINATION_GUARD_FAILED",
    recommendation: "Block recommendations without supporting citations.",
  },
  {
    control_id: "AI-011",
    title: "Mocked AI evidence mode is declared",
    pipeline: "ai-recommendation",
    severity: "security_failure",
    failure_code: "MOCKED_AI_MODE_MISSING",
    recommendation: "Declare mocked AI mode; do not call live providers in evidence runs.",
  },
]);

export const AI_CONTROL_INDEX = Object.freeze(
  Object.fromEntries(AI_CONTROLS.map((control) => [control.control_id, control])),
);

export const AI_PIPELINE_CONTROL_IDS = Object.freeze({
  "ai-recommendation": Object.freeze([
    "AI-001",
    "AI-005",
    "AI-006",
    "AI-007",
    "AI-008",
    "AI-009",
    "AI-010",
    "AI-011",
  ]),
  "ai-explanation": Object.freeze(["AI-002", "AI-005", "AI-010", "AI-011"]),
  "confidence-scoring": Object.freeze(["AI-003", "AI-004", "AI-011"]),
});

export const AI_REQUIRED_CONTROL_IDS = Object.freeze(
  AI_CONTROLS.map((control) => control.control_id),
);
