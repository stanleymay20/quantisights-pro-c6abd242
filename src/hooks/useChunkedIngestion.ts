// ---- Phase 4: React hook driving the ingestion worker ----
// Exposes a progressive ingestion API with cancel/restart/resume.
// Consumers (DataUpload.tsx, future bulk-import flows) get back rows,
// headers, progress, and a final rolling-health summary.
//
// Large-dataset rule (memory rule): if estimated rows > 50,000 we recommend
// routing to the server-side `ingest-csv-pipeline` edge function instead of
// processing in the browser. The hook surfaces `shouldRouteToServer` so the
// UI can short-circuit.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHUNK_ROWS,
  LARGE_DATASET_THRESHOLD,
  MAX_CLIENT_ROWS,
  computeProgress,
  type IngestionProgress,
} from "@/lib/chunked-processor";

interface IngestionResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
  completeness: number;
  duplicatePct: number;
  healthScore: number;
}

interface UseChunkedIngestionState {
  status: "idle" | "running" | "done" | "cancelled" | "error";
  progress: IngestionProgress;
  result: IngestionResult | null;
  error: string | null;
  shouldRouteToServer: boolean;
}

const initialProgress: IngestionProgress = {
  rowsProcessed: 0,
  totalRowsEstimate: null,
  chunksProcessed: 0,
  percent: 0,
  elapsedMs: 0,
  etaMs: null,
  memoryEstimateMb: 0,
};

export function useChunkedIngestion() {
  const workerRef = useRef<Worker | null>(null);
  const rowsRef = useRef<string[][]>([]);
  const headersRef = useRef<string[]>([]);
  const startedAtRef = useRef<number>(0);
  const [state, setState] = useState<UseChunkedIngestionState>({
    status: "idle",
    progress: initialProgress,
    result: null,
    error: null,
    shouldRouteToServer: false,
  });

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => () => terminate(), [terminate]);

  const cancel = useCallback(() => {
    if (workerRef.current) workerRef.current.postMessage({ type: "cancel" });
    setState((s) => ({ ...s, status: "cancelled" }));
  }, []);

  const reset = useCallback(() => {
    terminate();
    rowsRef.current = [];
    headersRef.current = [];
    setState({
      status: "idle",
      progress: initialProgress,
      result: null,
      error: null,
      shouldRouteToServer: false,
    });
  }, [terminate]);

  const start = useCallback(
    async (file: File, opts: { chunkRows?: number; collectRows?: boolean } = {}) => {
      reset();
      const chunkRows = opts.chunkRows ?? DEFAULT_CHUNK_ROWS;
      const collectRows = opts.collectRows ?? true;
      startedAtRef.current = Date.now();

      const fileText = await file.text();
      const totalBytes = file.size;

      // Quick line-count for pre-flight routing decision.
      const estimateRows = Math.max(0, fileText.split(/\r?\n/).length - 1);
      const routeToServer = estimateRows > LARGE_DATASET_THRESHOLD;

      if (routeToServer) {
        setState((s) => ({
          ...s,
          status: "done",
          shouldRouteToServer: true,
          progress: {
            ...initialProgress,
            totalRowsEstimate: estimateRows,
          },
        }));
        return;
      }
      if (estimateRows > MAX_CLIENT_ROWS) {
        setState((s) => ({
          ...s,
          status: "error",
          error: `Dataset exceeds in-browser ceiling (${MAX_CLIENT_ROWS.toLocaleString()} rows).`,
        }));
        return;
      }

      // Spin up worker
      const worker = new Worker(
        new URL("../workers/ingestion.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      setState((s) => ({ ...s, status: "running" }));

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg) return;
        switch (msg.type) {
          case "progress":
            setState((s) => ({ ...s, progress: msg.payload }));
            break;
          case "chunk":
            if (collectRows) {
              for (const r of msg.payload.rows) rowsRef.current.push(r);
            }
            break;
          case "done": {
            headersRef.current = msg.payload.headers;
            const finalProgress = computeProgress(
              msg.payload.totalRows,
              msg.payload.totalRows,
              state.progress.chunksProcessed + 1,
              startedAtRef.current,
            );
            setState({
              status: "done",
              progress: finalProgress,
              shouldRouteToServer: false,
              error: null,
              result: {
                headers: headersRef.current,
                rows: collectRows ? rowsRef.current : [],
                totalRows: msg.payload.totalRows,
                completeness: msg.payload.completeness,
                duplicatePct: msg.payload.duplicatePct,
                healthScore: msg.payload.healthScore,
              },
            });
            terminate();
            break;
          }
          case "error":
            setState((s) => ({
              ...s,
              status: "error",
              error: msg.payload.message,
            }));
            terminate();
            break;
        }
      };

      worker.onerror = (e) => {
        setState((s) => ({ ...s, status: "error", error: e.message }));
        terminate();
      };

      worker.postMessage({
        type: "start",
        payload: { fileText, totalBytes, chunkRows },
      });
    },
    [reset, state.progress.chunksProcessed, terminate],
  );

  return { ...state, start, cancel, reset };
}
