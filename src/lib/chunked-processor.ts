// ---- Phase 4: Chunked processing primitives ----
// Pure utilities for chunked ingestion. Web Worker driver lives in
// src/workers/ingestion.worker.ts and the React hook in
// src/hooks/useChunkedIngestion.ts. Keeping the math here means we can
// unit-test progress + ETA + memory estimates without spinning up a worker.

export const DEFAULT_CHUNK_ROWS = 5_000;
export const LARGE_DATASET_THRESHOLD = 50_000;
export const MAX_CLIENT_ROWS = 1_000_000;

export interface IngestionProgress {
  rowsProcessed: number;
  totalRowsEstimate: number | null;
  chunksProcessed: number;
  percent: number; // 0..100, NaN-safe
  elapsedMs: number;
  etaMs: number | null;
  /** Rough memory footprint estimate of buffered rows, in MB. */
  memoryEstimateMb: number;
}

/** Average bytes per CSV row used for memory estimation. */
const AVG_BYTES_PER_ROW = 256;

export function computeProgress(
  rowsProcessed: number,
  totalRowsEstimate: number | null,
  chunksProcessed: number,
  startedAt: number,
  now: number = Date.now(),
): IngestionProgress {
  const elapsedMs = Math.max(0, now - startedAt);
  let percent = 0;
  let etaMs: number | null = null;
  if (totalRowsEstimate && totalRowsEstimate > 0) {
    percent = Math.min(100, (rowsProcessed / totalRowsEstimate) * 100);
    if (rowsProcessed > 0 && percent < 100) {
      const rate = rowsProcessed / Math.max(1, elapsedMs); // rows/ms
      const remaining = Math.max(0, totalRowsEstimate - rowsProcessed);
      etaMs = Math.round(remaining / Math.max(rate, 1e-6));
    } else if (percent >= 100) {
      etaMs = 0;
    }
  }
  const memoryEstimateMb =
    (rowsProcessed * AVG_BYTES_PER_ROW) / (1024 * 1024);
  return {
    rowsProcessed,
    totalRowsEstimate,
    chunksProcessed,
    percent: Number.isFinite(percent) ? percent : 0,
    elapsedMs,
    etaMs,
    memoryEstimateMb: Math.round(memoryEstimateMb * 100) / 100,
  };
}

/** Estimate total rows in a file from a sample (header + first chunk bytes). */
export function estimateRowCount(
  sampleText: string,
  sampleBytes: number,
  totalBytes: number,
): number | null {
  if (totalBytes <= 0 || sampleBytes <= 0) return null;
  const sampleLines = sampleText.split(/\r?\n/).filter(Boolean).length - 1; // minus header
  if (sampleLines <= 0) return null;
  const ratio = totalBytes / sampleBytes;
  return Math.max(0, Math.round(sampleLines * ratio));
}

export interface ChunkPlan {
  chunkRows: number;
  expectedChunks: number;
  routeToServer: boolean;
  reason: string;
}

export function planIngestion(
  totalRowsEstimate: number | null,
  chunkRows: number = DEFAULT_CHUNK_ROWS,
): ChunkPlan {
  const rows = totalRowsEstimate ?? 0;
  if (rows > LARGE_DATASET_THRESHOLD) {
    return {
      chunkRows,
      expectedChunks: Math.ceil(rows / chunkRows),
      routeToServer: true,
      reason: `Dataset exceeds ${LARGE_DATASET_THRESHOLD.toLocaleString()} rows — route to server pipeline.`,
    };
  }
  return {
    chunkRows,
    expectedChunks: Math.max(1, Math.ceil(rows / chunkRows)),
    routeToServer: false,
    reason: "Process in browser via Web Worker.",
  };
}

export function formatEta(etaMs: number | null): string {
  if (etaMs === null) return "calculating…";
  if (etaMs < 1000) return "<1s";
  const seconds = Math.round(etaMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `${minutes}m ${remSec}s`;
}

// ---- Incremental health score (rolling) ----
export interface RollingHealth {
  rowsSeen: number;
  emptyCells: number;
  totalCells: number;
  duplicates: number;
  seenHashes: Set<string>;
}

export function newRollingHealth(): RollingHealth {
  return {
    rowsSeen: 0,
    emptyCells: 0,
    totalCells: 0,
    duplicates: 0,
    seenHashes: new Set(),
  };
}

/** Update rolling health with a chunk of rows. Mutates state for speed. */
export function updateRollingHealth(
  state: RollingHealth,
  rows: string[][],
): RollingHealth {
  for (const row of rows) {
    state.rowsSeen += 1;
    let hash = "";
    for (const cell of row) {
      state.totalCells += 1;
      if (!cell) state.emptyCells += 1;
      hash += cell + "|";
    }
    if (state.seenHashes.has(hash)) {
      state.duplicates += 1;
    } else if (state.seenHashes.size < 100_000) {
      // Cap memory: only track first 100k unique row signatures.
      state.seenHashes.add(hash);
    }
  }
  return state;
}

export function finalizeHealth(state: RollingHealth): {
  completeness: number;
  duplicatePct: number;
  healthScore: number;
} {
  const completeness =
    state.totalCells === 0
      ? 100
      : Math.round(((state.totalCells - state.emptyCells) / state.totalCells) * 100);
  const duplicatePct =
    state.rowsSeen === 0
      ? 0
      : Math.round((state.duplicates / state.rowsSeen) * 1000) / 10;
  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(completeness - duplicatePct * 2)),
  );
  return { completeness, duplicatePct, healthScore };
}
