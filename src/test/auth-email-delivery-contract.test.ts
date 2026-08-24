import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const hook = readFileSync(
  resolve(root, "supabase/functions/auth-email-hook/index.ts"),
  "utf8",
);
const hookImports = readFileSync(
  resolve(root, "supabase/functions/auth-email-hook/deno.json"),
  "utf8",
);
const forgotPassword = readFileSync(
  resolve(root, "src/pages/ForgotPassword.tsx"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);

describe("auth email delivery contract", () => {
  it("accepts Supabase native Send Email Hook payloads and signatures", () => {
    expect(hook).toContain("standardwebhooks@1.0.0");
    expect(hook).toContain("SEND_EMAIL_HOOK_SECRET");
    expect(hook).toContain("email_data: HookEmailData");
    expect(hook).toContain("emailData.email_action_type");
    expect(hook).toContain("webhook.verify(rawBody, headers)");

    expect(hook).not.toContain("parseEmailWebhookPayload");
    expect(hook).not.toContain("verifyWebhookRequest");
    expect(hook).not.toContain("x-lovable-signature");
    expect(hookImports).not.toContain("@lovable.dev/email-js");
    expect(hookImports).not.toContain("@lovable.dev/webhooks-js");
  });

  it("maps secure email-change hashes to the correct current and new recipients", () => {
    expect(hook).toContain("emailData.token_hash_new");
    expect(hook).toContain("recipient: currentEmail");
    expect(hook).toContain("recipient: newEmail");
    expect(hook).toContain("emailData.token_hash,");
  });

  it("makes hook retries idempotent and retryable without multiplying audit rows", () => {
    expect(hook).toContain("deterministicMessageId");
    expect(hook).toContain("idempotency_key: messageId");
    expect(hook).toContain(".select('id, status')");
    expect(hook).toContain("existingLog?.status === 'sent'");
    expect(hook).toContain("existingLog?.id");
    expect(hook).toContain("retryableResponse");
    expect(hook).toContain("'Retry-After': '2'");
    expect(hook).toContain("503");
    expect(hook).toContain("status: 'failed'");
    expect(hook).toContain(".eq('status', 'pending')");
  });

  it("keeps password recovery account-enumeration safe and does not claim delivery", () => {
    expect(forgotPassword).toContain("If an account exists for that email");
    expect(forgotPassword).toContain("Recovery requested for");
    expect(forgotPassword).toContain("we do not reveal whether an account exists");
    expect(forgotPassword).not.toContain("We sent you a password reset link");
    expect(forgotPassword).not.toContain("Sent to{\" \"}");
  });

  it("keeps staging authentication email independent of Lovable Cloud", () => {
    expect(stagingWorkflow).toContain("Ensure Auth email is independent of Lovable Cloud");
    expect(stagingWorkflow).toContain("node scripts/configure-supabase-auth-email.mjs disable");
    expect(stagingWorkflow).not.toContain("Rotate Auth Send Email Hook secret");
    expect(stagingWorkflow).not.toContain("Configure and verify staging Auth email pipeline");
    expect(stagingWorkflow).not.toContain("supabase secrets set SEND_EMAIL_HOOK_SECRET");
  });
});
