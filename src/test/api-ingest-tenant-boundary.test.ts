import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ingest = read("supabase/functions/api-ingest/index.ts");
const ci = read(".github/workflows/ci.yml");

describe("API ingest tenant boundary", () => {
  it("does not suppress TypeScript or bypass the service-client type boundary", () => {
    expect(ingest).not.toContain("@ts-nocheck");
    expect(ingest).not.toContain(" as any");
    expect(ci).toContain("deno check --config supabase/functions/deno.json supabase/functions/api-ingest/index.ts");
  });

  it("requires explicit Supabase service configuration", () => {
    expect(ingest).toContain('Deno.env.get("SUPABASE_URL")');
    expect(ingest).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(ingest).toContain("API ingestion service unavailable");
  });

  it("verifies JWT users are members of the resolved organization before service-role writes", () => {
    const membershipStart = ingest.indexOf('.from("organization_members")');
    const sourceResolution = ingest.indexOf("resolveApiDataSource", membershipStart);
    expect(membershipStart).toBeGreaterThan(-1);
    expect(sourceResolution).toBeGreaterThan(membershipStart);
    const membershipBlock = ingest.slice(membershipStart, sourceResolution);
    expect(membershipBlock).toContain('.eq("organization_id", profile.organization_id)');
    expect(membershipBlock).toContain('.eq("user_id", user.id)');
    expect(membershipBlock).toContain("User is not a member of organization");
  });

  it("scopes caller-supplied dataset ids to the authenticated organization", () => {
    const datasetHeaderCheck = ingest.indexOf("if (datasetIdHeader)");
    const datasetCreate = ingest.indexOf('if (!datasetName)', datasetHeaderCheck);
    expect(datasetHeaderCheck).toBeGreaterThan(-1);
    expect(datasetCreate).toBeGreaterThan(datasetHeaderCheck);
    const lookup = ingest.slice(datasetHeaderCheck, datasetCreate);
    expect(lookup).toContain('.eq("id", datasetIdHeader)');
    expect(lookup).toContain('.eq("organization_id", orgId)');
    expect(lookup).toContain("x-dataset-id not found for organization");
  });

  it("keeps API-key authentication organization-scoped through the matched data source", () => {
    const apiKeyStart = ingest.indexOf("if (apiKey)");
    const authFailure = ingest.indexOf('throw new Error("Authorization header or x-api-key required")', apiKeyStart);
    const apiKeyBlock = ingest.slice(apiKeyStart, authFailure);
    expect(apiKeyBlock).toContain('.eq("credentials_key_hash", keyHash)');
    expect(apiKeyBlock).toContain('.eq("status", "active")');
    expect(apiKeyBlock).toContain("orgId: source.organization_id");
    expect(apiKeyBlock).toContain("dataSourceId: source.id");
  });
});
