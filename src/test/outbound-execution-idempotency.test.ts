import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/execute-decision-action/index.ts"),
  "utf8",
);
const helperSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/execute-decision-action/idempotency.ts"),
  "utf8",
);
const hookSource = readFileSync(
  resolve(process.cwd(), "src/hooks/useExecutionPlans.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821162500_add_execution_action_receipts.sql"),
  "utf8",
);

describe("governed outbound execution idempotency", () => {
  it("persists one service-role receipt per organization and execution key", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.execution_action_receipts");
    expect(migrationSource).toContain("UNIQUE (organization_id, idempotency_key)");
    expect(migrationSource).toContain("ALTER TABLE public.execution_action_receipts ENABLE ROW LEVEL SECURITY");
    expect(migrationSource).toContain("'claimed', 'succeeded', 'failed', 'uncertain'");
  });

  it("claims the receipt atomically and treats uniqueness collisions as replay/conflict", () => {
    expect(helperSource).toContain('.from("execution_action_receipts")');
    expect(helperSource).toContain('if (insertError?.code !== "23505") throw insertError');
    expect(helperSource).toContain('? { kind: "replay", receipt }');
    expect(helperSource).toContain(': { kind: "conflict", receipt }');
    expect(helperSource).toContain('.eq("status", "claimed")');
  });

  it("requires governance approval before any outbound side effect", () => {
    const gateDefinition = edgeSource.indexOf("async function requireExecutablePlan(");
    const executableCheck = edgeSource.indexOf('decision.decision_status !== "executable"');
    const webhookCase = edgeSource.indexOf('case "trigger_webhook"');
    const webhookFetch = edgeSource.indexOf("const webhookResp = await fetch(webhook_url", webhookCase);
    const slackCase = edgeSource.indexOf('case "notify_slack"');
    const slackFetch = edgeSource.indexOf("resp = await fetch(`${GATEWAY_URL}/chat.postMessage`", slackCase);

    expect(gateDefinition).toBeGreaterThan(-1);
    expect(executableCheck).toBeGreaterThan(gateDefinition);
    expect(edgeSource.indexOf("requireExecutablePlan(", webhookCase)).toBeLessThan(webhookFetch);
    expect(edgeSource.indexOf("requireExecutablePlan(", slackCase)).toBeLessThan(slackFetch);
  });

  it("claims each external execution intent before dispatch and never blindly re-dispatches a replay", () => {
    const webhookCase = edgeSource.indexOf('case "trigger_webhook"');
    const webhookClaim = edgeSource.indexOf("const claim = await claimExecutionReceipt", webhookCase);
    const webhookReplay = edgeSource.indexOf('if (claim.kind === "replay")', webhookCase);
    const webhookFetch = edgeSource.indexOf("const webhookResp = await fetch(webhook_url", webhookCase);

    const slackCase = edgeSource.indexOf('case "notify_slack"');
    const slackClaim = edgeSource.indexOf("const claim = await claimExecutionReceipt", slackCase);
    const slackReplay = edgeSource.indexOf('if (claim.kind === "replay")', slackCase);
    const slackFetch = edgeSource.indexOf("resp = await fetch(`${GATEWAY_URL}/chat.postMessage`", slackCase);

    expect(webhookClaim).toBeGreaterThan(webhookCase);
    expect(webhookReplay).toBeGreaterThan(webhookClaim);
    expect(webhookFetch).toBeGreaterThan(webhookReplay);
    expect(slackClaim).toBeGreaterThan(slackCase);
    expect(slackReplay).toBeGreaterThan(slackClaim);
    expect(slackFetch).toBeGreaterThan(slackReplay);
    expect(edgeSource).toContain("return replayReceiptResponse(claim.receipt, corsHeaders)");
  });

  it("propagates the same idempotency key through client retries and downstream calls", () => {
    const webhookFunction = hookSource.indexOf("const triggerWebhook = useCallback");
    const webhookKey = hookSource.indexOf("const idempotencyKey = crypto.randomUUID()", webhookFunction);
    const webhookInvoke = hookSource.indexOf('invokeWithRetry("execute-decision-action"', webhookFunction);
    const slackFunction = hookSource.indexOf("const notifySlack = useCallback");
    const slackKey = hookSource.indexOf("const idempotencyKey = crypto.randomUUID()", slackFunction);
    const slackInvoke = hookSource.indexOf('invokeWithRetry("execute-decision-action"', slackFunction);

    expect(webhookKey).toBeGreaterThan(webhookFunction);
    expect(webhookKey).toBeLessThan(webhookInvoke);
    expect(slackKey).toBeGreaterThan(slackFunction);
    expect(slackKey).toBeLessThan(slackInvoke);
    expect(hookSource.match(/idempotency_key: idempotencyKey/g)?.length).toBe(2);
    expect(edgeSource.match(/"Idempotency-Key": idempotency_key/g)?.length).toBe(2);
  });

  it("records ambiguous transport outcomes as uncertain instead of issuing an unsafe retry intent", () => {
    expect(edgeSource).toContain('completeExecutionReceipt(supabase, receipt.id, "uncertain"');
    expect(edgeSource).toContain('event_type: "webhook_uncertain"');
    expect(edgeSource).toContain('event_type: "slack_uncertain"');
    expect(edgeSource).toContain("Reconcile the external system before issuing a new execution intent");
  });
});
