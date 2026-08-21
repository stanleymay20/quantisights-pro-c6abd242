export const MAX_OUTBOUND_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;
const BASE_RETRY_DELAY_MS = 500;

export type HttpOutcome = "success" | "retryable_failure" | "failed" | "uncertain";

export function classifyHttpOutcome(status: number): HttpOutcome {
  if (status >= 200 && status < 300) return "success";
  if (status === 429) return "retryable_failure";
  // A timeout response or server-side failure may arrive after the downstream
  // system has already committed the side effect. Never auto-retry these.
  if (status === 408 || status >= 500) return "uncertain";
  return "failed";
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)), MAX_RETRY_DELAY_MS);
}

async function recordAttempt(
  supabase: any,
  receiptId: string,
  attempt: number,
  retryReason: string | null,
) {
  const { error } = await supabase
    .from("execution_action_receipts")
    .update({
      attempt_count: attempt,
      last_attempt_at: new Date().toISOString(),
      last_retry_reason: retryReason,
    })
    .eq("id", receiptId)
    .eq("status", "claimed");
  if (error) throw error;
}

async function markExhausted(supabase: any, receiptId: string) {
  const { error } = await supabase
    .from("execution_action_receipts")
    .update({ retry_exhausted_at: new Date().toISOString(), last_retry_reason: "http_429" })
    .eq("id", receiptId)
    .eq("status", "claimed");
  if (error) throw error;
}

export async function dispatchWithBoundedRateLimitRetries(input: {
  supabase: any;
  receiptId: string;
  executionPlanId: string;
  organizationId: string;
  actorId: string;
  actionType: string;
  request: (attempt: number) => Promise<Response>;
}): Promise<{ response: Response; attempts: number; retryExhausted: boolean }> {
  for (let attempt = 1; attempt <= MAX_OUTBOUND_ATTEMPTS; attempt += 1) {
    await recordAttempt(input.supabase, input.receiptId, attempt, attempt > 1 ? "http_429" : null);

    // Any thrown transport error escapes immediately to the caller, which must
    // mark the receipt uncertain. There is intentionally no catch-and-retry here.
    const response = await input.request(attempt);
    if (response.status !== 429) {
      return { response, attempts: attempt, retryExhausted: false };
    }

    if (attempt === MAX_OUTBOUND_ATTEMPTS) {
      await markExhausted(input.supabase, input.receiptId);
      await input.supabase.from("execution_events").insert({
        execution_plan_id: input.executionPlanId,
        organization_id: input.organizationId,
        event_type: "outbound_retry_exhausted",
        actor_id: input.actorId,
        metadata: {
          action: input.actionType,
          receipt_id: input.receiptId,
          attempt,
          max_attempts: MAX_OUTBOUND_ATTEMPTS,
          reason: "http_429",
        },
      });
      await input.supabase.from("audit_log").insert({
        organization_id: input.organizationId,
        actor_id: input.actorId,
        actor_type: "user",
        action_type: "outbound_execution_retry_exhausted",
        resource_type: "execution_plan",
        resource_id: input.executionPlanId,
        payload: {
          action: input.actionType,
          receipt_id: input.receiptId,
          attempts: attempt,
          reason: "http_429",
        },
      });
      return { response, attempts: attempt, retryExhausted: true };
    }

    const delayMs = retryDelayMs(response, attempt);
    await input.supabase.from("execution_events").insert({
      execution_plan_id: input.executionPlanId,
      organization_id: input.organizationId,
      event_type: "outbound_retry_scheduled",
      actor_id: input.actorId,
      metadata: {
        action: input.actionType,
        receipt_id: input.receiptId,
        completed_attempt: attempt,
        next_attempt: attempt + 1,
        max_attempts: MAX_OUTBOUND_ATTEMPTS,
        reason: "http_429",
        delay_ms: delayMs,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Bounded retry loop exited unexpectedly");
}
