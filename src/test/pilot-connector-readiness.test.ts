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
  it("certifies only Salesforce and HubSpot for live external pilot connectivity", () => {
    const certified = externalConnectors.filter((type) => getPilotConnectorStatus(type) === "certified");
    expect(certified).toEqual(["salesforce", "hubspot"]);
  });

  it("keeps CSV available as file intake without calling it connector-certified", () => {
    expect(getPilotConnectorStatus("csv_upload")).toBe("file_intake");
    expect(canUseConnectorInPilot("csv_upload")).toBe(true);
    expect(pilotConnectorBadge("csv_upload")).toBe("Pilot file intake");
  });

  it("fails closed for every unreviewed or unknown connector", () => {
    for (const type of ["sap_odata", "snowflake", "stripe", "unknown_future_connector"]) {
      expect(getPilotConnectorStatus(type)).toBe("hardening");
      expect(canUseConnectorInPilot(type)).toBe(false);
      expect(pilotConnectorBlockReason(type)).toContain("still undergoing pilot hardening");
    }
  });

  it("provides clear certified labeling", () => {
    expect(pilotConnectorBadge("salesforce")).toBe("Pilot certified");
    expect(pilotConnectorBadge("hubspot")).toBe("Pilot certified");
    expect(pilotConnectorBlockReason("salesforce")).toBeNull();
  });
});
