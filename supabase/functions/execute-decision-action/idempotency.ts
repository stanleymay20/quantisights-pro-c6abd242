type JsonRecord = Record<string, unknown>;

export interface ExecutionReceipt {
  id: string;
  organization_id: string;
  execution_plan_id: string;
  decision_id: string;
  action_type: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: "claimed" | "succeeded" | "failed" | "uncertain";
  response_status: number | null;
  response_metadata: JsonRecord;
  error_message: string | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as JsonRecord)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(",")}}`;
}

async function sha256Hex(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validateIdempotencyKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 16
    && value.length <= 200
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

export async function claimExecutionReceipt(
  supabase: any,
  input: {
    organizationId: string;
    executionPlanId: string;
    decisionId: string;
    actionType: string;
    idempotencyKey: string;
    initiatedBy: string;
    request: JsonRecord;
  },
): Promise<
  | { kind: "claimed"; receipt: ExecutionReceipt }
  | { kind: "replay"; receipt: ExecutionReceipt }
  | { kind: "conflict"; receipt: ExecutionReceipt }
> {
  const fingerprint = await sha256Hex(input.request);

  const { data: created, error: insertError } = await supabase
    .from("execution_action_receipts")
    .insert({
      organization_id: input.organizationId,
      execution_plan_id: input.executionPlanId,
      decision_id: input.decisionId,
      action_type: input.actionType,
      idempotency_key: input.idempotencyKey,
      request_fingerprint: fingerprint,
      initiated_by: input.initiatedBy,
      status: "claimed",
    })
    .select("id, organization_id, execution_plan_id, decision_id, action_type, idempotency_key, request_fingerprint, status, response_status, response_metadata, error_message")
    .single();

  if (!insertError && created) {
    return { kind: "claimed", receipt: created as ExecutionReceipt };
  }

  if (insertError?.code !== "23505") throw insertError;

  const { data: existing, error: readError } = await supabase
    .from("execution_action_receipts")
    .select("id, organization_id, execution_plan_id, decision_id, action_type, idempotency_key, request_fingerprint, status, response_status, response_metadata, error_message")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (readError || !existing) throw readError ?? new Error("Existing idempotency receipt could not be loaded");

  const receipt = existing as ExecutionReceipt;
  const sameIntent = receipt.execution_plan_id === input.executionPlanId
    && receipt.decision_id === input.decisionId
    && receipt.action_type === input.actionType
    && receipt.request_fingerprint === fingerprint;

  return sameIntent
    ? { kind: "replay", receipt }
    : { kind: "conflict", receipt };
}

export async function completeExecutionReceipt(
  supabase: any,
  receiptId: string,
  status: "succeeded" | "failed" | "uncertain",
  options: {
    responseStatus?: number | null;
    responseMetadata?: JsonRecord;
    errorMessage?: string | null;
  } = {},
): Promise<void> {
  const { error } = await supabase
    .from("execution_action_receipts")
    .update({
      status,
      response_status: options.responseStatus ?? null,
      response_metadata: options.responseMetadata ?? {},
      error_message: options.errorMessage ? options.errorMessage.slice(0, 2000) : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", receiptId)
    .eq("status", "claimed");

  if (error) throw error;
}
