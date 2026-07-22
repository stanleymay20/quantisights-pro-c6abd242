// tests/load/lib/workflow-assert.js
// Asserts a full business workflow completed: decision + evidence + audit etc.
import { workflowSuccessRate, workflowFailures } from "./observability.js";

export function assertWorkflow(steps) {
  // steps: { decisionCreated, evidenceLinked, recommendation, confidenceRecorded, ledgerEntry, auditAppended, reportCompleted }
  const ok = Object.values(steps).every(Boolean);
  workflowSuccessRate.add(ok);
  if (!ok) workflowFailures.add(1);
  return ok;
}
