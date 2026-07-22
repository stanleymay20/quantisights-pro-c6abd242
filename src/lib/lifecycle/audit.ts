/**
 * Audit log utilities — immutable write-ahead logging
 */
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";

export interface AuditLogEntry {
  organization_id: string;
  actor_id: string | null;
  action_type: string;
  resource_type: string;
  resource_id: string;
  payload?: Record<string, unknown>;
}

/** Write an immutable audit log entry */
export async function writeAuditLog(entry: AuditLogEntry) {
  try {
    await supabase.from("audit_log").insert([{
      organization_id: entry.organization_id,
      actor_id: entry.actor_id,
      actor_type: "user",
      action_type: entry.action_type,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      payload: entry.payload ? JSON.parse(JSON.stringify(entry.payload)) : null,
    }]);
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
    captureError(
      err instanceof Error ? err : new Error("Audit log write failed"),
      { action_type: entry.action_type, resource_id: entry.resource_id }
    );
  }
}
