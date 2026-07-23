/**
 * Client-side retry wrapper for supabase.functions.invoke()
 * Retries only on network/5xx errors with exponential backoff.
 *
 * Special handling:
 * - 402 Payment Required → does NOT retry; parses JSON body and dispatches
 *   a global `quantivis:upgrade-required` event so a top-level provider can
 *   surface an upgrade modal.
 */
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";

interface InvokeOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Hard wall-clock timeout in ms per attempt (default: 25_000 ms). */
  timeoutMs?: number;
}

export interface UpgradeRequiredDetail {
  feature: string;
  message: string;
  reason?: string;
  functionName: string;
}

function isRetryable(error: unknown): boolean {
  if (!error) return false;
  const msg = String(error);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch failed")) return true;
  if (/\b5\d{2}\b/.test(msg)) return true;
  return false;
}

/**
 * Try to extract a JSON body from a FunctionsHttpError. Supabase JS v2 attaches
 * the original Response on `error.context`. Returns null if unparseable.
 */
async function extractErrorBody(error: unknown): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (!error || typeof error !== "object") return null;
  const ctx = (error as { context?: Response }).context;
  if (!ctx || typeof ctx.clone !== "function") return null;
  try {
    const cloned = ctx.clone();
    const body = (await cloned.json()) as Record<string, unknown>;
    return { status: ctx.status, body };
  } catch {
    return null;
  }
}

/** Invoke an edge function with automatic retry for transient failures. */
export async function invokeWithRetry<T = unknown>(
  functionName: string,
  options?: InvokeOptions,
  retryConfig?: RetryConfig
): Promise<{ data: T | null; error: Error | null }> {
  const { maxAttempts = 3, baseDelayMs = 300, timeoutMs = 25_000 } = retryConfig ?? {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Wrap each attempt with a hard timeout so the UI never hangs indefinitely.
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Edge function "${functionName}" timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const invokePromise = supabase.functions.invoke(functionName, options);

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (error) {
        // Parse the error body — if it's a 402, surface upgrade event and stop.
        const parsed = await extractErrorBody(error);
        if (parsed?.status === 402) {
          const detail: UpgradeRequiredDetail = {
            feature: String(parsed.body.feature ?? "this feature"),
            message: String(parsed.body.message ?? "Your subscription tier does not include this feature."),
            reason: parsed.body.reason ? String(parsed.body.reason) : undefined,
            functionName,
          };
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent<UpgradeRequiredDetail>("quantivis:upgrade-required", { detail }));
          }
          return { data: null, error: new Error(detail.message) };
        }

        if (!isRetryable(error.message)) {
          return { data: null, error: new Error(error.message) };
        }
        if (attempt < maxAttempts - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return { data: null, error: new Error(error.message) };
      }

      return { data: data as T, error: null };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (!isRetryable(errorObj.message) || attempt >= maxAttempts - 1) {
        captureError(errorObj, {
          functionName,
          attempt: attempt + 1,
          context: "invokeWithRetry",
        });
        return { data: null, error: errorObj };
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { data: null, error: new Error(`invokeWithRetry: exhausted ${maxAttempts} attempts for ${functionName}`) };
}
