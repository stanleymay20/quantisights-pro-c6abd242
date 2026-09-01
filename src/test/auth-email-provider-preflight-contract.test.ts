import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const preflight = readFileSync(
  resolve(root, "scripts/preflight-supabase-auth-email.mjs"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);
const productionWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-edge-functions.yml"),
  "utf8",
);

describe("Auth email provider preflight contract", () => {
  it("requires protected-environment provider credentials and checks Supabase secret names", () => {
    expect(preflight).toContain("RESEND_API_KEY must be configured in the protected GitHub Environment");
    expect(preflight).toContain("RESEND_FROM_EMAIL must be configured in the protected GitHub Environment");
    expect(preflight).toContain("/secrets");
    expect(preflight).toContain('"RESEND_API_KEY"');
    expect(preflight).toContain('"RESEND_FROM_EMAIL"');
    expect(preflight).toContain("entry?.name");
    expect(preflight).toContain("Required Auth email provider secret name(s) missing");
    expect(preflight).not.toContain("decrypted_secret");
  });

  it("validates the real Resend key and configured sender with a controlled test send", () => {
    const providerStart = preflight.indexOf("const verifyResendProviderCredentials");
    const providerEnd = preflight.indexOf("const verifyWorkerRuntimeWithoutPrivilege");
    expect(providerStart).toBeGreaterThan(-1);
    expect(providerEnd).toBeGreaterThan(providerStart);
    const providerSection = preflight.slice(providerStart, providerEnd);

    expect(providerSection).toContain('fetch("https://api.resend.com/emails"');
    expect(providerSection).toContain("delivered+quantivis-auth-preflight@resend.dev");
    expect(providerSection).toContain("Authorization: `Bearer ${resendApiKey}`");
    expect(providerSection).toContain("from: resendFromEmail");
    expect(providerSection).toContain('"Idempotency-Key": idempotencyKey');
    expect(providerSection).toContain("Resend provider preflight failed with HTTP");
    expect(providerSection).not.toContain("response.text()");
    expect(providerSection).not.toContain("console.log(resendApiKey");
  });

  it("proves worker runtime and in-function authorization without privileged credentials", () => {
    expect(preflight).toContain("quantivis-auth-email-preflight-invalid");
    expect(preflight).toContain("response.status === 403");
    expect(preflight).toContain("response.status === 500");
    expect(preflight).toContain("response.status === 401");
    expect(preflight).toContain("service-role enforcement is broken");
  });

  it("preflights staging before disabling the active transport", () => {
    const preflightIndex = stagingWorkflow.indexOf("node scripts/preflight-supabase-auth-email.mjs");
    const disableIndex = stagingWorkflow.indexOf("node scripts/configure-supabase-auth-email.mjs disable");
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(disableIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(disableIndex);
  });

  it("preflights production before disabling the active transport", () => {
    const preflightIndex = productionWorkflow.indexOf("node scripts/preflight-supabase-auth-email.mjs");
    const disableIndex = productionWorkflow.indexOf("node scripts/configure-supabase-auth-email.mjs disable");
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(disableIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(disableIndex);
  });
});
