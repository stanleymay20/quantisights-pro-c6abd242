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

const expectSafeWorkflowOrdering = (workflow: string, label: string) => {
  const sectionStart = workflow.indexOf(`Configure independent ${label} Auth email transport`);
  expect(sectionStart).toBeGreaterThan(-1);
  const section = workflow.slice(sectionStart);

  const providerInputIndex = section.indexOf(
    "node scripts/preflight-supabase-auth-email.mjs provider-input",
  );
  const providerSecretWriteIndex = section.indexOf(
    "RESEND_API_KEY=\"$RESEND_API_KEY\"",
  );
  const runtimeIndex = section.indexOf(
    "node scripts/preflight-supabase-auth-email.mjs runtime",
  );
  const disableIndex = section.indexOf(
    "node scripts/configure-supabase-auth-email.mjs disable",
  );

  expect(providerInputIndex).toBeGreaterThan(-1);
  expect(providerSecretWriteIndex).toBeGreaterThan(providerInputIndex);
  expect(runtimeIndex).toBeGreaterThan(providerSecretWriteIndex);
  expect(disableIndex).toBeGreaterThan(runtimeIndex);
};

describe("Auth email provider preflight contract", () => {
  it("allows Supabase-managed credentials while requiring GitHub inputs to be a complete pair", () => {
    expect(preflight).toContain(
      "RESEND_API_KEY and RESEND_FROM_EMAIL must either both be configured or both be absent",
    );
    expect(preflight).not.toContain(
      "RESEND_API_KEY must be configured in the protected GitHub Environment",
    );
    expect(preflight).not.toContain(
      "RESEND_FROM_EMAIL must be configured in the protected GitHub Environment",
    );
  });

  it("validates proposed replacement credentials with Resend's documented test recipient", () => {
    const providerStart = preflight.indexOf("const verifyProviderInput");
    const providerEnd = preflight.indexOf("const verifySupabaseManagedProvider");
    expect(providerStart).toBeGreaterThan(-1);
    expect(providerEnd).toBeGreaterThan(providerStart);
    const providerSection = preflight.slice(providerStart, providerEnd);

    expect(preflight).toContain(
      'const RESEND_TEST_RECIPIENT = "delivered@resend.dev";',
    );
    expect(providerSection).toContain('fetch("https://api.resend.com/emails"');
    expect(providerSection).toContain("to: [RESEND_TEST_RECIPIENT]");
    expect(providerSection).toContain("Authorization: `Bearer ${resendApiKey}`");
    expect(providerSection).toContain("from: resendFromEmail");
    expect(providerSection).toContain('"Idempotency-Key": idempotencyKey');
    expect(providerSection).toContain(
      "Resend provider-input preflight failed with HTTP",
    );
    expect(providerSection).not.toContain("response.text()");
  });

  it("checks only Supabase secret names and never requests decrypted secret values", () => {
    expect(preflight).toContain(`/v1/projects/${"${projectRef}"}/secrets`);
    expect(preflight).toContain('"RESEND_API_KEY"');
    expect(preflight).toContain('"RESEND_FROM_EMAIL"');
    expect(preflight).toContain("entry?.name");
    expect(preflight).toContain("Required Auth email provider secret name(s) missing");
    expect(preflight).not.toContain("decrypted_secret");
  });

  it("uses the service-role credential only in memory to run the worker provider preflight", () => {
    expect(preflight).toContain(`/v1/projects/${"${projectRef}"}/api-keys?reveal=true`);
    expect(preflight).toContain("const serviceRoleKey = await getLegacyServiceRoleKey()");
    expect(preflight).toContain("await verifySupabaseManagedProvider(serviceRoleKey)");
    expect(preflight).toContain('body: JSON.stringify({ mode: "provider_preflight" })');
    expect(preflight).toContain("apikey: serviceRoleKey");
    expect(preflight).toContain("Authorization: `Bearer ${serviceRoleKey}`");
    expect(preflight).not.toContain("console.log(serviceRoleKey");
    expect(preflight).not.toContain("console.log(resendApiKey");
  });

  it("still proves in-function authorization with an invalid bearer probe", () => {
    expect(preflight).toContain("quantivis-auth-email-preflight-invalid");
    expect(preflight).toContain("response.status === 403");
    expect(preflight).toContain("response.status === 500");
    expect(preflight).toContain("response.status === 401");
    expect(preflight).toContain("service-role enforcement is broken");
  });

  it("validates staging replacement input before secret rotation and runtime before disable", () => {
    expectSafeWorkflowOrdering(stagingWorkflow, "staging");
  });

  it("validates production replacement input before secret rotation and runtime before disable", () => {
    expectSafeWorkflowOrdering(productionWorkflow, "production");
  });
});
