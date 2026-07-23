// tests/load/workflows/decisions.js
import http from "k6/http";
import { authHeaders } from "../lib/auth.js";
import { recordResponse } from "../lib/observability.js";

const URL = __ENV.LOAD_SUPABASE_URL;

export function createDecision(token, orgId) {
  const h = { ...authHeaders(token), Prefer: "return=representation" };
  const payload = JSON.stringify({
    organization_id: orgId,
    title: `loadtest ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "load-test decision",
    decision_type: "operational",
    execution_status: "not_started",
  });
  const res = http.post(`${URL}/rest/v1/decision_ledger`, payload, {
    headers: h, tags: { kind: "rest_write", name: "create_decision" },
  });
  recordResponse(res, { workflow: "create_decision", org: orgId });
  if (res.status >= 200 && res.status < 300) {
    const body = res.json();
    return Array.isArray(body) ? body[0]?.id : body?.id;
  }
  return null;
}

export function attachEvidence(token, decisionId, orgId) {
  const h = authHeaders(token);
  const res = http.post(`${URL}/rest/v1/evidence_sources`, JSON.stringify({
    decision_id: decisionId, organization_id: orgId,
    source_type: "mock", source_ref: `mock://${decisionId}`,
  }), { headers: h, tags: { kind: "rest_write", name: "attach_evidence" } });
  recordResponse(res, { workflow: "attach_evidence", org: orgId });
  return res.status >= 200 && res.status < 300;
}
