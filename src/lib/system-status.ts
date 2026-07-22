export type SystemStatus = "unknown" | "operational" | "degraded" | "outage";

interface SystemStatusEvidence {
  queriesSucceeded: boolean;
  recordedRuns: number;
  criticalFailures: number;
  nonCriticalFailures: number;
  staleCriticalJobs?: number;
}

export const deriveSystemStatus = ({
  queriesSucceeded,
  recordedRuns,
  criticalFailures,
  nonCriticalFailures,
  staleCriticalJobs = 0,
}: SystemStatusEvidence): SystemStatus => {
  if (!queriesSucceeded || recordedRuns === 0) return "unknown";
  if (criticalFailures > 0) return "outage";
  if (staleCriticalJobs > 0) return "degraded";
  if (nonCriticalFailures > 0) return "degraded";
  return "operational";
};
