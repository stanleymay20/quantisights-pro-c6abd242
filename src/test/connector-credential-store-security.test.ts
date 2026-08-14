import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const store = read("supabase/functions/connector-credential-store/index.ts");
const ci = read(".github/workflows/ci.yml");

describe("connector credential storage security", () => {
  it("does not suppress TypeScript checking in the privileged credential store", () => {
    expect(store).not.toContain("@ts-nocheck");
    expect(store).toContain("CredentialStoreRequest");
    expect(store).toContain("parseRequestBody");
  });

  it("never downgrades a failed Vault write into ordinary connector config", () => {
    expect(store).not.toContain('config[`credential_${field}`]');
    expect(store).not.toContain("Postgres encrypts at rest");
    expect(store).toContain("Unable to securely store connector credential");
    expect(store).toContain("Never persist a");
    expect(store).toContain("credential value in data_connectors.config");
  });

  it("persists only Vault key references in connector config", () => {
    expect(store).toContain("vault_keys: vaultKeys");
    expect(store).toContain("credential_vault_keys: vaultKeys");
    expect(store).toContain("vault_fields: Object.keys(vaultKeys)");
  });

  it("Deno-checks the credential store in CI", () => {
    expect(ci).toContain("deno check supabase/functions/connector-credential-store/index.ts");
    expect(ci).toContain("Typecheck privileged Edge functions");
  });
});
