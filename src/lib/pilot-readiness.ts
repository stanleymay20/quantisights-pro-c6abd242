export type PilotConnectorStatus = "certified" | "file_intake" | "hardening";

const CERTIFIED_CONNECTORS = new Set(["salesforce", "hubspot"]);

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
  return canUseConnectorInPilot(connectorType)
    ? null
    : "This integration is still undergoing pilot hardening. Salesforce and HubSpot are currently certified for live connector use; CSV upload remains available for file-based pilots.";
}
