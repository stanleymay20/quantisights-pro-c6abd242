export type GovernedActionCapability =
  | "observe"
  | "recommend"
  | "approve_execute"
  | "bounded_autonomy";

export type ConnectorActionPolicy = {
  capability: GovernedActionCapability;
  allowedActions: ReadonlySet<string>;
  reversibleActions: ReadonlySet<string>;
};

// Keep this registry fail-closed. A pull adapter is NOT proof of safe write capability.
export const CONNECTOR_ACTION_POLICIES: Readonly<Record<string, ConnectorActionPolicy>> = Object.freeze({
  salesforce: { capability: "recommend", allowedActions: new Set(), reversibleActions: new Set() },
  hubspot: { capability: "recommend", allowedActions: new Set(), reversibleActions: new Set() },
  sap: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  sap_odata: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  netsuite: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  dynamics: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  snowflake: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  bigquery: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
  s3: { capability: "observe", allowedActions: new Set(), reversibleActions: new Set() },
});

export function normalizeConnectorType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getConnectorActionPolicy(connectorType: unknown): ConnectorActionPolicy | null {
  return CONNECTOR_ACTION_POLICIES[normalizeConnectorType(connectorType)] ?? null;
}

export function canExecuteExternalAction(connectorType: unknown, actionType: string) {
  const policy = getConnectorActionPolicy(connectorType);
  if (!policy) {
    return { allowed: false, reason: "unsupported_connector_type", reversible: false } as const;
  }
  if (policy.capability !== "approve_execute" && policy.capability !== "bounded_autonomy") {
    return { allowed: false, reason: `connector_capability_${policy.capability}`, reversible: false } as const;
  }
  if (!policy.allowedActions.has(actionType)) {
    return { allowed: false, reason: "unsupported_action_type", reversible: false } as const;
  }
  return {
    allowed: true,
    reason: "allowed",
    reversible: policy.reversibleActions.has(actionType),
  } as const;
}
