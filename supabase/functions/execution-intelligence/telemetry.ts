/**
 * Per-action observability telemetry for execution-intelligence.
 * Provides structured logging with latency, error rate, and throughput tracking.
 */

interface ActionTelemetry {
  action: string;
  correlationId: string;
  orgId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: "started" | "completed" | "failed";
  errorMessage?: string;
  itemsProcessed?: number;
  itemsCreated?: number;
}

// In-memory rolling window for per-action stats (resets on cold start)
const actionStats = new Map<string, {
  totalCalls: number;
  totalErrors: number;
  totalDurationMs: number;
  p95Durations: number[];
  lastCallAt: number;
}>();

const MAX_P95_WINDOW = 100;

export function emitTelemetry(telemetry: ActionTelemetry): void {
  const logEntry = {
    ...telemetry,
    timestamp: new Date().toISOString(),
    source: "execution-intelligence",
  };

  if (telemetry.status === "failed") {
    console.error(`[telemetry] ${JSON.stringify(logEntry)}`);
  } else {
    console.log(`[telemetry] ${JSON.stringify(logEntry)}`);
  }

  // Update rolling stats
  const stats = actionStats.get(telemetry.action) || {
    totalCalls: 0,
    totalErrors: 0,
    totalDurationMs: 0,
    p95Durations: [],
    lastCallAt: 0,
  };

  stats.totalCalls++;
  stats.lastCallAt = Date.now();

  if (telemetry.status === "failed") {
    stats.totalErrors++;
  }

  if (telemetry.durationMs !== undefined) {
    stats.totalDurationMs += telemetry.durationMs;
    stats.p95Durations.push(telemetry.durationMs);
    if (stats.p95Durations.length > MAX_P95_WINDOW) {
      stats.p95Durations.shift();
    }
  }

  actionStats.set(telemetry.action, stats);
}

export function getActionStats(): Record<string, {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastCallAt: string;
}> {
  const result: Record<string, {
    totalCalls: number;
    errorRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    lastCallAt: string;
  }> = {};

  for (const [action, stats] of actionStats) {
    const sorted = [...stats.p95Durations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    result[action] = {
      totalCalls: stats.totalCalls,
      errorRate: stats.totalCalls > 0 ? Math.round((stats.totalErrors / stats.totalCalls) * 10000) / 100 : 0,
      avgDurationMs: stats.totalCalls > 0 ? Math.round(stats.totalDurationMs / stats.totalCalls) : 0,
      p95DurationMs: sorted.length > 0 ? sorted[Math.min(p95Index, sorted.length - 1)] : 0,
      lastCallAt: new Date(stats.lastCallAt).toISOString(),
    };
  }

  return result;
}
