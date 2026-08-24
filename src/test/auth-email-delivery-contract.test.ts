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

  it("uses deterministic message IDs and updates the pending audit row on enqueue failure", () => {
    expect(hook).toContain("deterministicMessageId");
    expect(hook).toContain("idempotency_key: messageId");
    expect(hook).toContain(".update({");
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
});
