export type PilotConnectorStatus = "certified" | "file_intake" | "hardening";

// A connector is only certified when its current provisioning path matches the
// credentials/token model required by the production puller end-to-end.
const CERTIFIED_CONNECTORS = new Set(["hubspot"]);

export function getPilotConnectorStatus(connectorType: string): PilotConnectorStatus {
  if (CERTIFIED_CONNECTORS.has(connectorType)) return "certified";
  if (connectorType === "csv_upload") return "file_intake";
  return "hardening";
}

export function canUseConnectorInPilot(connectorType: string): boolean {
  const status = getPilotConnectorStatus(connectorType);
  return status === "certified" || status === "file_intake";
}

export function pilotConnectorBadge(connectorType: string): string {
  switch (getPilotConnectorStatus(connectorType)) {
    case "certified": return "Pilot certified";
    case "file_intake": return "Pilot file intake";
    case "hardening": return "Pilot hardening";
  }
}

export function pilotConnectorBlockReason(connectorType: string): string | null {
  if (canUseConnectorInPilot(connectorType)) return null;
  if (connectorType === "salesforce") {
    return "Salesforce OAuth linking is still undergoing pilot hardening. It will be re-enabled only after the provisioning flow is certified against the Vault-backed token lifecycle used by the production puller.";
  }
  return "This integration is still undergoing pilot hardening. HubSpot is currently certified for live connector use; CSV upload remains available for file-based pilots.";
}
