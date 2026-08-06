export interface PublicAnalysisPayload {
  metrics: string;
  companyContext: string;
}

export class PublicAnalysisError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PublicAnalysisError";
  }
}

interface RequestOptions {
  url: string;
  publishableKey: string;
  payload: PublicAnalysisPayload;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  requestId?: string;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const delay = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, milliseconds);
  signal?.addEventListener("abort", () => {
    window.clearTimeout(timer);
    reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
  }, { once: true });
});

async function readError(response: Response): Promise<{ message: string; code: string }> {
  const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
  return {
    message: body?.error ?? "The analysis service could not complete the request.",
    code: body?.code ?? `http_${response.status}`,
  };
}

export async function requestPublicAnalysis({
  url,
  publishableKey,
  payload,
  signal,
  timeoutMs = 45_000,
  maxAttempts = 2,
  fetchImpl = fetch,
  requestId = crypto.randomUUID(),
}: RequestOptions): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(new DOMException("Analysis timed out", "TimeoutError")), timeoutMs);
    const abort = () => controller.abort(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publishableKey}`,
          "X-Request-ID": requestId,
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) return response;

      const error = await readError(response);
      const retryable = RETRYABLE_STATUS.has(response.status);
      if (!retryable || attempt === maxAttempts) {
        throw new PublicAnalysisError(error.message, response.status, error.code, retryable);
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      await delay(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1_000, 5_000) : 500 * attempt, signal);
    } catch (error) {
      if (error instanceof PublicAnalysisError) throw error;
      if (signal?.aborted) throw new PublicAnalysisError("Analysis cancelled.", null, "cancelled", true);
      if (attempt === maxAttempts) {
        const timedOut = controller.signal.reason instanceof DOMException
          && controller.signal.reason.name === "TimeoutError";
        throw new PublicAnalysisError(
          timedOut ? "The analysis timed out. Please try again." : "The analysis service is temporarily unreachable.",
          null,
          timedOut ? "timeout" : "network_error",
          true,
        );
      }
      await delay(500 * attempt, signal);
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  throw new PublicAnalysisError("Analysis failed.", null, "unknown", false);
}
