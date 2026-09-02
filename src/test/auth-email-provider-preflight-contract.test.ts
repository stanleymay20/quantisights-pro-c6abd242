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

  it("classifies every runtime sub-gate with bounded secret-safe codes", () => {
    for (const code of [
      "management-secret-list-failed",
      "provider-secret-names-missing",
      "management-api-keys-failed",
      "legacy-service-role-unresolved",
      "worker-provider-auth-failed",
      "worker-provider-runtime-failed",
      "worker-provider-unexpected",
      "invalid-probe-privilege-bypass",
      "invalid-probe-runtime-failed",
      "invalid-probe-gateway-intercept",
      "invalid-probe-unexpected",
    ]) {
      expect(preflight).toContain(`"${code}"`);
    }

    expect(preflight).toContain("AUTH_EMAIL_PREFLIGHT_DIAGNOSTIC_PATH");
    expect(preflight).toContain('writeDiagnostic("failure", safeError.code, safeError.httpStatus)');
    expect(preflight).toContain('writeDiagnostic("success", "runtime-ok")');

    const diagnosticStart = preflight.indexOf("const writeDiagnostic =");
    const diagnosticEnd = preflight.indexOf("const fail =", diagnosticStart);
    expect(diagnosticStart).toBeGreaterThan(-1);
    expect(diagnosticEnd).toBeGreaterThan(diagnosticStart);
    const diagnosticSection = preflight.slice(diagnosticStart, diagnosticEnd);

    expect(diagnosticSection).toContain("action: safeAction");
    expect(diagnosticSection).toContain("status,");
    expect(diagnosticSection).toContain("code,");
    expect(diagnosticSection).toContain("http_status:");
    expect(diagnosticSection).toContain("project_ref: safeProjectRef");
    expect(diagnosticSection).not.toContain("message:");
    expect(diagnosticSection).not.toContain("resendApiKey");
    expect(diagnosticSection).not.toContain("resendFromEmail");
    expect(diagnosticSection).not.toContain("serviceRoleKey");
    expect(diagnosticSection).not.toContain("response");
  });

  it("does not copy remote response bodies into management failure diagnostics", () => {
    const managementStart = preflight.indexOf("const managementRequest =");
    const managementEnd = preflight.indexOf("const readConfiguredSecretNames", managementStart);
    expect(managementStart).toBeGreaterThan(-1);
    expect(managementEnd).toBeGreaterThan(managementStart);
    const managementSection = preflight.slice(managementStart, managementEnd);

    expect(managementSection).not.toContain("payload?.message");
    expect(managementSection).not.toContain("payload?.error");
    expect(managementSection).not.toContain("response body");
  });

  it("validates staging replacement input before secret rotation and runtime before disable", () => {
    expectSafeWorkflowOrdering(stagingWorkflow, "staging");
  });

  it("validates production replacement input before secret rotation and runtime before disable", () => {
    expectSafeWorkflowOrdering(productionWorkflow, "production");
  });

  it("persists secret-safe shell and preflight diagnostics for the staging Auth transport gate", () => {
    expect(stagingWorkflow).toContain("id: auth_email");
    expect(stagingWorkflow).toContain("trap on_error ERR");
    expect(stagingWorkflow).toContain('write_diagnostic "failure" "$exit_code"');
    expect(stagingWorkflow).toContain('write_diagnostic "success" "0"');
    expect(stagingWorkflow).toContain(
      'export AUTH_EMAIL_PREFLIGHT_DIAGNOSTIC_PATH="$diagnostic_dir/preflight.json"',
    );
    expect(stagingWorkflow).toContain('phase="provider-input-preflight"');
    expect(stagingWorkflow).toContain('phase="provider-secret-rotation"');
    expect(stagingWorkflow).toContain('phase="runtime-provider-preflight"');
    expect(stagingWorkflow).toContain('phase="disable-existing-transport"');
    expect(stagingWorkflow).toContain('phase="hook-secret-rotation"');
    expect(stagingWorkflow).toContain('phase="configure-transport"');
    expect(stagingWorkflow).toContain('phase="verify-transport"');
    expect(stagingWorkflow).toContain('phase="configure-staging-rate-limits"');

    const diagnosticStart = stagingWorkflow.indexOf("write_diagnostic() {");
    const diagnosticEnd = stagingWorkflow.indexOf("trap on_error ERR", diagnosticStart);
    expect(diagnosticStart).toBeGreaterThan(-1);
    expect(diagnosticEnd).toBeGreaterThan(diagnosticStart);
    const diagnosticSection = stagingWorkflow.slice(diagnosticStart, diagnosticEnd);

    expect(diagnosticSection).toContain('"status": "%s"');
    expect(diagnosticSection).toContain('"phase": "%s"');
    expect(diagnosticSection).toContain('"exit_code": %s');
    expect(diagnosticSection).toContain('"project_ref": "%s"');
    expect(diagnosticSection).toContain('"certified_sha": "%s"');
    expect(diagnosticSection).not.toContain("RESEND_API_KEY");
    expect(diagnosticSection).not.toContain("RESEND_FROM_EMAIL");
    expect(diagnosticSection).not.toContain("SEND_EMAIL_HOOK_SECRET");
    expect(diagnosticSection).not.toContain("BASH_COMMAND");

    expect(stagingWorkflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(stagingWorkflow).toContain(
      "if: ${{ always() && steps.auth_email.outcome != 'skipped' }}",
    );
    expect(stagingWorkflow).toContain(
      "path: artifacts/auth-email-transport/",
    );
    expect(stagingWorkflow).toContain("if-no-files-found: error");
  });
});
