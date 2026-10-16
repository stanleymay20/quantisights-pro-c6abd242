export type GovernedActionCapability =
  | "observe"
  | "recommend"
  | "approve_execute"
  | "bounded_autonomy";

export type GovernedActionStatus =
  | "dry_run"
  | "approval_required"
  | "executed"
  | "failed"
  | "unknown";

export interface GovernedActionRequest {
  organization_id: string;
  decision_id: string;
  connector_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  dry_run?: boolean;
}

export interface GovernedActionResult {
  status: GovernedActionStatus;
  action_id: string;
  provider_receipt_id?: string;
  response_digest?: string;
  reversible: boolean;
  verified_at?: string;
}

export interface ConnectorActionPolicy {
  connectorType: string;
  capability: GovernedActionCapability;
  allowedActions: ReadonlySet<string>;
  reversibleActions: ReadonlySet<string>;
}

/**
 * Source-of-truth policy for external write capability.
 *
 * IMPORTANT: Existing Quantivis connectors are intentionally read/recommend
 * only until a connector-specific write adapter is proven against a sandbox or
 * staging provider. Do not upgrade one of these entries to approve_execute
 * merely because a connector has a pull/read implementation.
 */
export const CONNECTOR_ACTION_POLICIES: Readonly<Record<string, ConnectorActionPolicy>> = Object.freeze({
  salesforce: {
    connectorType: "salesforce",
    capability: "recommend",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  hubspot: {
    connectorType: "hubspot",
    capability: "recommend",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  sap: {
    connectorType: "sap",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  sap_odata: {
    connectorType: "sap_odata",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  netsuite: {
    connectorType: "netsuite",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  dynamics: {
    connectorType: "dynamics",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  snowflake: {
    connectorType: "snowflake",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  bigquery: {
    connectorType: "bigquery",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
  s3: {
    connectorType: "s3",
    capability: "observe",
    allowedActions: new Set<string>(),
    reversibleActions: new Set<string>(),
  },
});

export function normalizeConnectorType(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getConnectorActionPolicy(connectorType: string | null | undefined): ConnectorActionPolicy | null {
  const normalized = normalizeConnectorType(connectorType);
  return CONNECTOR_ACTION_POLICIES[normalized] ?? null;
}

export function canExecuteExternalAction(
  connectorType: string | null | undefined,
  actionType: string,
): { allowed: boolean; reason: string; reversible: boolean } {
  const policy = getConnectorActionPolicy(connectorType);
  if (!policy) {
    return { allowed: false, reason: "unsupported_connector_type", reversible: false };
  }

  if (policy.capability !== "approve_execute" && policy.capability !== "bounded_autonomy") {
    return { allowed: false, reason: `connector_capability_${policy.capability}`, reversible: false };
  }

  if (!policy.allowedActions.has(actionType)) {
    return { allowed: false, reason: "unsupported_action_type", reversible: false };
  }

  return {
    allowed: true,
    reason: "allowed",
    reversible: policy.reversibleActions.has(actionType),
  };
}

export function validateGovernedActionRequest(input: unknown):
  | { ok: true; value: GovernedActionRequest }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "request must be an object" };
  }

  const req = input as Partial<GovernedActionRequest>;
  const requiredStrings: Array<keyof Pick<GovernedActionRequest,
    "organization_id" | "decision_id" | "connector_id" | "action_type" | "idempotency_key"
  >> = ["organization_id", "decision_id", "connector_id", "action_type", "idempotency_key"];

  for (const key of requiredStrings) {
    const value = req[key];
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: `${key} is required` };
    }
  }

  if (!req.payload || typeof req.payload !== "object" || Array.isArray(req.payload)) {
    return { ok: false, error: "payload must be an object" };
  }

  if (req.idempotency_key!.length > 200) {
    return { ok: false, error: "idempotency_key is too long" };
  }

  return {
    ok: true,
    value: {
      organization_id: req.organization_id!.trim(),
      decision_id: req.decision_id!.trim(),
      connector_id: req.connector_id!.trim(),
      action_type: req.action_type!.trim(),
      payload: req.payload as Record<string, unknown>,
      idempotency_key: req.idempotency_key!.trim(),
      dry_run: req.dry_run !== false,
    },
  };
}
