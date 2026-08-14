import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const store = read("supabase/functions/connector-credential-store/index.ts");
const ci = read(".github/workflows/ci.yml");
const rollbackMigration = read(
  "supabase/migrations/20260814212000_add_delete_vault_secret_for_connector_rollback.sql",
);

describe("connector credential storage security", () => {
  it("does not suppress TypeScript checking in the privileged credential store", () => {
    expect(store).not.toContain("@ts-nocheck");
    expect(store).toContain("CredentialStoreRequest");
    expect(store).toContain("parseRequestBody");
  });

  it("restricts paid-pilot connector provisioning to certified CRM paths", () => {
    expect(store).toContain('new Set(["salesforce", "hubspot"])');
    expect(store).toContain("This connector is not enabled for the paid pilot");
    expect(store).not.toContain('connector_type: "rest_api"');
  });

  it("never downgrades failed Vault writes into ordinary connector config", () => {
    expect(store).not.toContain('config[`credential_${field}`]');
    expect(store).not.toContain("Postgres encrypts at rest");
    expect(store).toContain("Unable to securely store connector credentials");
    expect(store).toContain("vault_keys: vaultKeys");
    expect(store).toContain("credential_vault_keys: vaultKeys");
  });

  it("rolls back partial provisioning with a service-only Vault deletion primitive", () => {
    expect(store).toContain("const rollback = async () =>");
    expect(store).toContain('svc.rpc("delete_vault_secret"');
    expect(store).toContain('.from("data_sources")');
    expect(store).toContain('.from("data_connectors")');
    expect(rollbackMigration).toContain("CREATE OR REPLACE FUNCTION public.delete_vault_secret");
    expect(rollbackMigration).toContain("GRANT EXECUTE ON FUNCTION public.delete_vault_secret(text) TO service_role");
    expect(rollbackMigration).toContain("REVOKE ALL ON FUNCTION public.delete_vault_secret(text) FROM PUBLIC, anon, authenticated");
  });

  it("requires the linked data source, schedule, and audit write before reporting success", () => {
    expect(store).toContain("Unable to create connector data source");
    expect(store).toContain("Unable to link connector data source");
    expect(store).toContain("Unable to schedule connector sync");
    expect(store).toContain("Unable to complete audited connector provisioning");
    expect(store).toContain("data_source_id: dataSourceId");
    expect(store).toContain("schedule_kind");
  });

  it("Deno-checks the credential store in CI", () => {
    expect(ci).toContain("deno check supabase/functions/connector-credential-store/index.ts");
    expect(ci).toContain("Typecheck privileged Edge functions");
  });
});
