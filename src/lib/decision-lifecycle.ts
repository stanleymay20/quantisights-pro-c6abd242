/**
 * Decision Lifecycle Side Effects — barrel export
 * 
 * Re-exports from focused modules for backward compatibility.
 */
export { writeAuditLog } from "./lifecycle/audit";
export type { AuditLogEntry } from "./lifecycle/audit";
export { onDecisionApproved, onDecisionDismissed, onExecutionStatusChanged } from "./lifecycle/execution";
export { embedInsightsBatch, embedAdvisoriesBatch } from "./lifecycle/embedding";
export { checkEvaluability, evaluabilityColor, evaluabilityBadgeVariant } from "./lifecycle/evaluability";
export type { EvaluabilityResult, EvaluabilityStatus } from "./lifecycle/evaluability";
