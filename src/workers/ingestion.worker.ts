// ---- Phase 4: Web Worker for chunked CSV ingestion ----
// Runs OFF the UI thread. Uses Papa.parse in streaming mode and emits
// incremental progress + rolling profile updates to the main thread.
//
// Message protocol (main → worker):
//   { type: "start", payload: { fileText: string, totalBytes: number, chunkRows: number } }
//   { type: "cancel" }
// Message protocol (worker → main):
//   { type: "progress", payload: IngestionProgress }
//   { type: "chunk", payload: { rows: string[][], chunkIndex: number } }
//   { type: "done", payload: { totalRows: number, headers: string[], health } }
//   { type: "error", payload: { message: string } }
//
// The worker never holds the entire dataset; it forwards chunks to the
// main thread which decides whether to keep them (≤100k) or stream into
// the server pipeline (>50k routes to `ingest-csv-pipeline` edge fn).

/// <reference lib="webworker" />

import Papa from "papaparse";
import {
  DEFAULT_CHUNK_ROWS,
  computeProgress,
  finalizeHealth,
  newRollingHealth,
  updateRollingHealth,
  type IngestionProgress,
  type RollingHealth,
} from "@/lib/chunked-processor";

type InMsg =
  | { type: "start"; payload: { fileText: string; totalBytes: number; chunkRows?: number } }
  | { type: "cancel" };

type OutMsg =
  | { type: "progress"; payload: IngestionProgress }
  | { type: "chunk"; payload: { rows: string[][]; chunkIndex: number } }
  | {
      type: "done";
      payload: {
        totalRows: number;
        headers: string[];
        completeness: number;
        duplicatePct: number;
        healthScore: number;
      };
    }
  | { type: "error"; payload: { message: string } };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let cancelled = false;

function post(msg: OutMsg): void {
  ctx.postMessage(msg);
}

function start(payload: { fileText: string; totalBytes: number; chunkRows?: number }): void {
  cancelled = false;
  const chunkRows = payload.chunkRows ?? DEFAULT_CHUNK_ROWS;
  const startedAt = Date.now();

  let headers: string[] = [];
  let totalRows = 0;
  let chunkIndex = 0;
  let buffer: string[][] = [];
  const health: RollingHealth = newRollingHealth();

  // Estimate total rows for ETA. Cheap line-count.
  const totalRowsEstimate = payload.fileText
    ? Math.max(0, payload.fileText.split(/\r?\n/).length - 1)
    : null;

  const flushBuffer = (): void => {
    if (buffer.length === 0) return;
    updateRollingHealth(health, buffer);
    post({ type: "chunk", payload: { rows: buffer, chunkIndex } });
    chunkIndex += 1;
    buffer = [];
    post({
      type: "progress",
      payload: computeProgress(totalRows, totalRowsEstimate, chunkIndex, startedAt),
    });
  };

  try {
    Papa.parse<string[]>(payload.fileText, {
      skipEmptyLines: true,
      worker: false, // we ARE the worker
      step: (results, parser) => {
        if (cancelled) {
          parser.abort();
          return;
        }
        const row = results.data as unknown as string[];
        if (!Array.isArray(row)) return;
        if (totalRows === 0 && headers.length === 0) {
          headers = row.map((h) => String(h ?? "").trim());
        } else {
          buffer.push(row.map((c) => String(c ?? "")));
          totalRows += 1;
          if (buffer.length >= chunkRows) flushBuffer();
        }
      },
      complete: () => {
        if (cancelled) {
          post({ type: "error", payload: { message: "Ingestion cancelled by user." } });
          return;
        }
        flushBuffer();
        const finalHealth = finalizeHealth(health);
        post({
          type: "done",
          payload: {
            totalRows,
            headers,
            ...finalHealth,
          },
        });
      },
      error: (err) => {
        post({ type: "error", payload: { message: err.message || "Parser error" } });
      },
    });
  } catch (err) {
    post({
      type: "error",
      payload: { message: err instanceof Error ? err.message : "Unknown ingestion error" },
    });
  }
}

ctx.addEventListener("message", (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === "start") start(msg.payload);
  else if (msg.type === "cancel") {
    cancelled = true;
  }
});

export {};
