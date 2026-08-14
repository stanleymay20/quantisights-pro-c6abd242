import { describe, expect, it } from "vitest";

import {
  normalizeHubSpotObjects,
  normalizeHubSpotPageSize,
  parseHubSpotCollectionPage,
  parseHubSpotPullRequest,
  safeHubSpotHttpError,
  validateHubSpotCursor,
} from "../../supabase/functions/_shared/hubspot-pull-guard";

describe("HubSpot pull request/config guards", () => {
  it("accepts only supported modes", () => {
    expect(parseHubSpotPullRequest({ connector_id: " h-1 ", mode: "historical_backfill" })).toEqual({
      connectorId: "h-1",
      mode: "historical_backfill",
    });
    expect(() => parseHubSpotPullRequest({ connector_id: "h-1", mode: "fast" })).toThrow(
      "mode must be historical_backfill or incremental_sync",
    );
  });

  it("restricts configured objects to the supported HubSpot surface", () => {
    expect(normalizeHubSpotObjects(["companies", "deals", "companies"])).toEqual(["companies", "deals"]);
    expect(() => normalizeHubSpotObjects(["owners"])).toThrow("HubSpot object not allowed");
    expect(() => normalizeHubSpotObjects("companies")).toThrow("config.objects must be an array");
  });

  it("bounds page size to an explicit 1–100 integer", () => {
    expect(normalizeHubSpotPageSize(undefined, 50)).toBe(50);
    expect(normalizeHubSpotPageSize(100, 50)).toBe(100);
    expect(() => normalizeHubSpotPageSize(0, 50)).toThrow("between 1 and 100");
    expect(() => normalizeHubSpotPageSize(10.5, 50)).toThrow("must be an integer");
  });
});

describe("HubSpot checkpoint and pagination guards", () => {
  it("accepts safe ISO and epoch cursor values", () => {
    expect(validateHubSpotCursor("2026-08-14T20:00:00Z")).toBe("2026-08-14T20:00:00Z");
    expect(validateHubSpotCursor("1723665600000")).toBe("1723665600000");
  });

  it("rejects injectable or malformed persisted cursors", () => {
    expect(() => validateHubSpotCursor("2026-08-14T20:00:00Z OR 1=1")).toThrow("not a safe timestamp");
    expect(() => validateHubSpotCursor("yesterday")).toThrow("not a safe timestamp");
  });

  it("validates result arrays and paging cursors", () => {
    expect(
      parseHubSpotCollectionPage({
        results: [{ id: "1" }],
        paging: { next: { after: "NTI1Cg%3D%3D" } },
      }),
    ).toEqual({ results: [{ id: "1" }], after: "NTI1Cg%3D%3D" });
    expect(() => parseHubSpotCollectionPage({ results: "bad" })).toThrow("missing results array");
    expect(() =>
      parseHubSpotCollectionPage({ results: [], paging: { next: { after: "bad cursor with spaces" } } }),
    ).toThrow("paging cursor is invalid");
  });

  it("redacts upstream response bodies", () => {
    expect(safeHubSpotHttpError("deals", 429, { category: "RATE_LIMIT", message: "sensitive body" })).toBe(
      "HubSpot deals 429 RATE_LIMIT",
    );
    expect(safeHubSpotHttpError("../../secret", 500, "sensitive body")).toBe("HubSpot resource 500");
  });
});
