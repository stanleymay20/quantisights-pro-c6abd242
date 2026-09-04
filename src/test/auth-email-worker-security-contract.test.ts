import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const worker = readFileSync(
  resolve(root, "supabase/functions/process-email-queue/index.ts"),
  "utf8",
);
const supabaseConfig = readFileSync(
  resolve(root, "supabase/config.toml"),
  "utf8",
);

describe("Auth email worker security contract", () => {
  it("uses a dedicated invocation secret when gateway JWT verification is disabled", () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.process-email-queue\]\s+verify_jwt = false/,
    );
    expect(worker).toContain("Deno.env.get('EMAIL_QUEUE_WORKER_SECRET')");
    expect(worker).toContain("token !== workerAuthSecret");
    expect(worker).toContain("JSON.stringify({ error: 'Forbidden' })");
    expect(worker).not.toContain("claims?.role !== 'service_role'");
  });

  it("checks provider runtime before the no-send authorization probe", () => {
    const runtimeGuard = worker.indexOf(
      "if (!resendApiKey || !resendFromEmail || !supabaseUrl || !supabaseServiceKey || !workerAuthSecret)",
    );
    const authGuard = worker.indexOf("token !== workerAuthSecret");

    expect(runtimeGuard).toBeGreaterThanOrEqual(0);
    expect(authGuard).toBeGreaterThan(runtimeGuard);
  });

  it("runs provider preflight only after worker-secret authentication and before queue access", () => {
    const authGuard = worker.indexOf("token !== workerAuthSecret");
    const providerStart = worker.indexOf(
      "if (requestPayload.mode === 'provider_preflight')",
    );
    const clientStart = worker.indexOf(
      "const supabase = createClient(supabaseUrl, supabaseServiceKey)",
    );
    const queueRead = worker.indexOf("read_email_batch");

    expect(authGuard).toBeGreaterThan(-1);
    expect(providerStart).toBeGreaterThan(authGuard);
    expect(clientStart).toBeGreaterThan(providerStart);
    expect(queueRead).toBeGreaterThan(providerStart);

    const providerSection = worker.slice(providerStart, clientStart);
    expect(providerSection).toContain("await sendResendEmail({");
    expect(providerSection).toContain("to: RESEND_TEST_RECIPIENT");
    expect(providerSection).toContain("JSON.stringify({ provider_preflight: true })");
    expect(providerSection).not.toContain("read_email_batch");
    expect(providerSection).not.toContain("email_send_log");
  });

  it("uses Resend's controlled recipient and does not log provider credentials", () => {
    expect(worker).toContain(
      "const RESEND_TEST_RECIPIENT = 'delivered@resend.dev'",
    );
    expect(worker).not.toContain("console.log(resendApiKey");
    expect(worker).not.toContain("console.error(resendApiKey");
    expect(worker).not.toContain("console.log(resendFromEmail");
    expect(worker).not.toContain("console.error(resendFromEmail");
  });
});
