import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";

export type QueueApprovalSourceType = "advisory" | "signal" | null;

export interface CreateAndApproveQueueDecisionInput {
  organizationId: string;
  recommendedAction: string;
  confidence?: number | null;
  rawConfidence?: number | null;
  cappedConfidence?: number | null;
  confidenceCapReason?: string | null;
  decisionContextId?: string | null;
  notes?: string | null;
  datasetId?: string | null;
  expectedMetric?: string | null;
  evaluationWindowDays?: number;
  suggestedOwner?: string | null;
  sourceType?: QueueApprovalSourceType;
  sourceId?: string | null;
}

interface AtomicApprovalResult {
  decision_id: string;
  decision_status: "approved";
  approval?: unknown;
  source_type?: QueueApprovalSourceType;
  source_id?: string | null;
}

interface RpcErrorLike {
  message: string;
}

type UntypedRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcErrorLike | null }>;

/**
 * Create and approve a dashboard-queue decision in one database transaction.
 *
 * The RPC inserts the ledger row as pending and delegates the final transition
 * to public.approve_decision(), so an approved row can never be committed
 * without its execution plan, outcome contract and audit entry.
 */
export async function createAndApproveQueueDecision(
  input: CreateAndApproveQueueDecisionInput,
): Promise<AtomicApprovalResult> {
  const rpc = supabase.rpc as unknown as UntypedRpc;
  const sourceType = input.sourceType ?? null;
  const sourceId = input.sourceId ?? null;

  if ((sourceType === null) !== (sourceId === null)) {
    throw new Error("Queue approval source type and source id must be supplied together");
  }

  const { data, error } = await rpc("create_and_approve_decision", {
    _organization_id: input.organizationId,
    _recommended_action: input.recommendedAction,
    _chosen_action: input.recommendedAction,
    _confidence_at_decision: input.confidence ?? null,
    _raw_confidence: input.rawConfidence ?? input.confidence ?? null,
    _capped_confidence: input.cappedConfidence ?? input.confidence ?? null,
    _confidence_cap_reason: input.confidenceCapReason ?? null,
    _decision_type: "strategic",
    _decision_context_id: input.decisionContextId ?? null,
    _notes: input.notes ?? null,
    _dataset_id: input.datasetId ?? null,
    _expected_metric: input.expectedMetric ?? null,
    _evaluation_window_days: input.evaluationWindowDays ?? 30,
    _suggested_owner: input.suggestedOwner ?? null,
    _source_type: sourceType,
    _source_id: sourceId,
  });

  if (error) throw new Error(error.message);

  const result = data as Partial<AtomicApprovalResult> | null;
  if (!result?.decision_id || result.decision_status !== "approved") {
    throw new Error("Atomic decision approval returned an invalid response");
  }

  // These are enrichment jobs only. The durable decision lifecycle is already
  // committed atomically before these run, so enrichment failure cannot create
  // a partial approval state.
  const enrichmentJobs = [
    supabase.functions.invoke("embed-decisions", {
      body: {
        organization_id: input.organizationId,
        mode: "specific",
        entity_ids: [result.decision_id],
      },
    }),
    supabase.functions.invoke("predict-outcome", {
      body: {
        organization_id: input.organizationId,
        decision_id: result.decision_id,
      },
    }),
  ];

  void Promise.allSettled(enrichmentJobs).then((settled) => {
    settled.forEach((job, index) => {
      if (job.status === "rejected") {
        captureError(
          job.reason instanceof Error ? job.reason : new Error("Post-approval enrichment failed"),
          {
            decisionId: result.decision_id,
            enrichment: index === 0 ? "embed-decisions" : "predict-outcome",
          },
        );
      }
    });
  });

  return result as AtomicApprovalResult;
}
