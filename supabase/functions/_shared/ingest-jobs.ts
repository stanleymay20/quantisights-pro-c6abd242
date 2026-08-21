type ServiceClient = any;

export interface SyncJobRecord {
  id: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
}

export async function findIdempotentJob(
  svc: ServiceClient,
  requestId: string,
  organizationId: string,
  dataSourceId?: string,
): Promise<SyncJobRecord | null> {
  let query = svc
    .from("data_sync_jobs")
    .select("id,status,records_synced,error_message")
    .eq("request_id", requestId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (dataSourceId) query = query.eq("data_source_id", dataSourceId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Idempotency lookup failed: ${error.message}`);
  }
  return data ? data as SyncJobRecord : null;
}

export async function createSyncJob(
  svc: ServiceClient,
  params: {
    dataSourceId: string;
    organizationId: string;
    requestId: string;
    status?: "running" | "pending";
  },
): Promise<string> {
  const { data, error } = await svc
    .from("data_sync_jobs")
    .insert({
      data_source_id: params.dataSourceId,
      organization_id: params.organizationId,
      request_id: params.requestId,
      status: params.status ?? "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to create sync job: ${error?.message ?? "Unknown error"}`);
  }
  return data.id as string;
}

export async function finalizeSyncJob(
  svc: ServiceClient,
  params: {
    jobId: string;
    inserted: number;
    errors: string[];
  },
): Promise<"completed" | "partial" | "failed"> {
  const status = params.inserted === 0
    ? "failed"
    : params.errors.length > 0
      ? "partial"
      : "completed";

  const { error } = await svc
    .from("data_sync_jobs")
    .update({
      status,
      records_synced: params.inserted,
      error_message: params.errors.length > 0 ? params.errors.slice(0, 10).join("; ") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.jobId);

  if (error) throw new Error(`Sync job finalization failed: ${error.message}`);
  return status;
}

export async function failSyncJob(
  svc: ServiceClient,
  params: { jobId: string; errorMessage: string },
): Promise<void> {
  const { error } = await svc
    .from("data_sync_jobs")
    .update({
      status: "failed",
      error_message: params.errorMessage.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.jobId);

  if (error) {
    throw new Error(`Sync job failure bookkeeping failed: ${error.message}`);
  }
}
