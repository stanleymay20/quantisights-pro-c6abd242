import { describe, expect, it } from "vitest";
import {
  CONNECTOR_ACTION_POLICIES,
  canExecuteExternalAction,
  getConnectorActionPolicy,
  normalizeConnectorType,
  validateGovernedActionRequest,
} from "@/lib/governed-action-contract";

describe("governed enterprise action contract", () => {
  it("fails closed for unknown connector types", () => {
    expect(getConnectorActionPolicy("made-up-erp")).toBeNull();
    expect(canExecuteExternalAction("made-up-erp", "write")).toEqual({
      allowed: false,
      reason: "unsupported_connector_type",
      reversible: false,
    });
  });

  it("does not confuse existing pull connectors with proven write adapters", () => {
    for (const type of ["salesforce", "hubspot", "sap", "sap_odata", "netsuite", "dynamics", "snowflake", "bigquery", "s3"]) {
      const policy = getConnectorActionPolicy(type);
      expect(policy).not.toBeNull();
      expect(["observe", "recommend"]).toContain(policy!.capability);
      expect(policy!.allowedActions.size).toBe(0);
      expect(canExecuteExternalAction(type, "update_record").allowed).toBe(false);
    }
  });

  it("keeps bounded autonomy disabled across the initial registry", () => {
    for (const policy of Object.values(CONNECTOR_ACTION_POLICIES)) {
      expect(policy.capability).not.toBe("bounded_autonomy");
    }
  });

  it("normalizes connector type safely", () => {
    expect(normalizeConnectorType("  SalesForce ")).toBe("salesforce");
    expect(normalizeConnectorType(undefined)).toBe("");
  });

  it("defaults every valid action request to dry-run", () => {
    const result = validateGovernedActionRequest({
      organization_id: "org-1",
      decision_id: "decision-1",
      connector_id: "connector-1",
      action_type: "create_task",
      payload: { subject: "Follow up" },
      idempotency_key: "decision-1:create_task:1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.dry_run).toBe(true);
  });

  it("allows dry_run=false only as an explicit request flag, not as authorization", () => {
    const result = validateGovernedActionRequest({
      organization_id: "org-1",
      decision_id: "decision-1",
      connector_id: "connector-1",
      action_type: "create_task",
      payload: {},
      idempotency_key: "key-1",
      dry_run: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.dry_run).toBe(false);
    expect(canExecuteExternalAction("salesforce", "create_task").allowed).toBe(false);
  });

  it("rejects missing authority/linkage/idempotency fields", () => {
    for (const field of ["organization_id", "decision_id", "connector_id", "action_type", "idempotency_key"] as const) {
      const request: Record<string, unknown> = {
        organization_id: "org-1",
        decision_id: "decision-1",
        connector_id: "connector-1",
        action_type: "create_task",
        payload: {},
        idempotency_key: "key-1",
      };
      delete request[field];
      const result = validateGovernedActionRequest(request);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(field);
    }
  });

  it("rejects non-object payloads and oversized idempotency keys", () => {
    const badPayload = validateGovernedActionRequest({
      organization_id: "org-1",
      decision_id: "decision-1",
      connector_id: "connector-1",
      action_type: "create_task",
      payload: "unsafe",
      idempotency_key: "key-1",
    });
    expect(badPayload.ok).toBe(false);

    const oversized = validateGovernedActionRequest({
      organization_id: "org-1",
      decision_id: "decision-1",
      connector_id: "connector-1",
      action_type: "create_task",
      payload: {},
      idempotency_key: "x".repeat(201),
    });
    expect(oversized.ok).toBe(false);
  });
});
