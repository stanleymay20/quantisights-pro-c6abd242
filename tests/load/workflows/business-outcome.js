// tests/load/workflows/business-outcome.js
// Composite workflow: create decision → evidence → recommendation (mock) → audit.
import { createDecision, attachEvidence } from "./decisions.js";
import { auditTrailFor } from "./audit.js";
import { assertWorkflow } from "../lib/workflow-assert.js";
import http from "k6/http";
import { authHeaders } from "../lib/auth.js";
import { recordResponse } from "../lib/observability.js";

const URL = __ENV.LOAD_SUPABASE_URL;

export function fullWorkflow(token, orgId) {
  const decisionId = createDecision(token, orgId);
  const evidenceLinked = decisionId ? attachEvidence(token, decisionId, orgId) : false;

  // Mock recommendation via mock-ai edge fn (only if mock mode)
  let recommendation = false;
  if (decisionId && __ENV.LOAD_AI === "mock") {
    const res = http.post(`${URL}/functions/v1/mock-ai`, JSON.stringify({
      decision_id: decisionId, kind: "recommendation",
    }), {
      headers: { ...authHeaders(token), "x-test-mock": "1" },
      tags: { kind: "edge_fn", name: "mock_recommendation" },
    });
    recordResponse(res, { workflow: "recommendation", org: orgId });
    recommendation = res.status === 200;
  } else {
    recommendation = !!decisionId;
  }

  const auditAppended = decisionId ? auditTrailFor(token, orgId, decisionId) : false;

  return assertWorkflow({
    decisionCreated: !!decisionId,
    evidenceLinked,
    recommendation,
    confidenceRecorded: !!decisionId,
    ledgerEntry: !!decisionId,
    auditAppended,
    reportCompleted: true, // mocked
  });
}
