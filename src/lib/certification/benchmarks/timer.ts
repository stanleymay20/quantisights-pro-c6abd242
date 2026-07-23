// Tiny benchmarking helpers — wall-clock only. Avoids pulling in perf_hooks
// so the same code runs in both Node test runner and the browser.

export interface BenchResult<T> {
  value: T;
  durationMs: number;
  /** Rough heap delta in MB (Node only; 0 in browser). */
  heapDeltaMb: number;
}

export async function bench<T>(fn: () => T | Promise<T>): Promise<BenchResult<T>> {
  const heapBefore = readHeapMb();
  const start = Date.now();
  const value = await fn();
  const durationMs = Date.now() - start;
  const heapAfter = readHeapMb();
  return { value, durationMs, heapDeltaMb: Math.max(0, heapAfter - heapBefore) };
}

function readHeapMb(): number {
  try {
    const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
    if (proc?.memoryUsage) {
      return proc.memoryUsage().heapUsed / (1024 * 1024);
    }
  } catch {
    // ignore
  }
  return 0;
}
