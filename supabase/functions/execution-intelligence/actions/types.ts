/**
 * Shared types for execution-intelligence action modules
 */

export interface ActionContext {
  orgId: string;
  userId: string;
  correlationId: string;
  body: Record<string, unknown>;
}

export interface ActionLogMeta {
  runType: string;
  runId: string;
  processed: number;
  created: number;
  meta?: Record<string, unknown>;
}

export interface ActionResult {
  data: unknown;
  status?: number;
  logMeta?: ActionLogMeta;
}
