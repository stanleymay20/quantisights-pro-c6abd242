import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canUseConnectorInPilot,
  getPilotConnectorStatus,
  pilotConnectorBadge,
  pilotConnectorBlockReason,
} from "@/lib/pilot-readiness";

const externalConnectors = [
  "postgres", "mysql", "sqlserver", "snowflake", "bigquery", "powerbi",
  "salesforce", "hubspot", "dynamics", "sap_odata", "netsuite", "xero",
  "stripe", "google_analytics", "google_sheets", "rest_api",
];

describe("paid-pilot connector support boundary", () => {
  it("certifies only HubSpot for live external pilot connectivity", () => {
    const certified = externalConnectors.filter((type) => getPilotConnectorStatus(type) === "certified");
    expect(certified).toEqual(["hubspot"]);
  });

  it("keeps CSV available as file intake without calling it connector-certified", () => {
    expect(getPilotConnectorStatus("csv_upload")).toBe("file_intake");
    expect(canUseConnectorInPilot("csv_upload")).toBe(true);
    expect(pilotConnectorBadge("csv_upload")).toBe("Pilot file intake");
  });

  it("fails closed for every unreviewed or unknown connector", () => {
    for (const type of ["salesforce", "sap_odata", "snowflake", "stripe", "unknown_future_connector"]) {
      expect(getPilotConnectorStatus(type)).toBe("hardening");
      expect(canUseConnectorInPilot(type)).toBe(false);
      expect(pilotConnectorBlockReason(type)).toContain("pilot hardening");
    }
  });

  it("keeps Salesforce blocked until OAuth token provisioning is certified", () => {
    expect(canUseConnectorInPilot("salesforce")).toBe(false);
    expect(pilotConnectorBadge("salesforce")).toBe("Pilot hardening");
    expect(pilotConnectorBlockReason("salesforce")).toContain("Salesforce OAuth linking");

    const provisioner = readFileSync("supabase/functions/connector-credential-store/index.ts", "utf8");
    expect(provisioner).toContain('const PILOT_CONNECTOR_TYPES = new Set(["hubspot"]);');
    expect(provisioner).not.toContain('new Set(["salesforce", "hubspot"])');
  });

  it("matches the deployed data_sources schema contract when provisioning HubSpot", () => {
    const provisioner = readFileSync("supabase/functions/connector-credential-store/index.ts", "utf8");
    expect(provisioner).toContain('source_type: "connector",\n        status: "pending",\n        created_by: user.id,');
    expect(provisioner).not.toContain('source_type: "connector",\n        connector_type,');
    expect(provisioner).toContain("config: { connector_id: connectorId, connector_type },");
  });

  it("provides clear certified labeling for HubSpot", () => {
    expect(pilotConnectorBadge("hubspot")).toBe("Pilot certified");
    expect(pilotConnectorBlockReason("hubspot")).toBeNull();
  });
});
