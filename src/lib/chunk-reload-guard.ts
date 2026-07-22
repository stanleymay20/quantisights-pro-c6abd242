/**
 * Recover from stale dynamic-import chunks after a redeploy.
 *
 * When a tab was opened against an older deploy and the user navigates to a
 * lazy-loaded route, Vite tries to fetch an asset filename that no longer
 * exists on the CDN. Surfaced as one of:
 *   - `vite:preloadError` (modulepreload failure)
 *   - "Failed to fetch dynamically imported module"
 *   - "error loading dynamically imported module"
 *   - "Importing a module script failed."
 *   - "ChunkLoadError" / "Loading chunk … failed"
 *
 * We force a single hard reload to pick up the new index.html. A
 * sessionStorage guard prevents an infinite loop if the asset is genuinely
 * missing.
 */
const RELOAD_FLAG = "quantivis_chunk_reload_attempt";

const isStaleChunkError = (msg: string | undefined | null): boolean => {
  if (!msg) return false;
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
};

const reloadOnce = (reason: string) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      console.error("[chunk-reload-guard] Already reloaded once; not retrying:", reason);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — still attempt one reload */
  }
  console.warn("[chunk-reload-guard] Stale chunk detected; hard-reloading:", reason);
  window.location.reload();
};

export const installChunkReloadGuard = () => {
  if (typeof window === "undefined") return;

  // Clear the guard after a successful boot so the next stale event can recover.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* noop */
    }
  }, 10_000);

  // Vite-native event for failed module preloads.
  window.addEventListener("vite:preloadError", (event: Event) => {
    (event as Event & { preventDefault?: () => void }).preventDefault?.();
    reloadOnce("vite:preloadError");
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    if (isStaleChunkError(event.message)) reloadOnce(event.message);
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string } | string | undefined;
    const msg = typeof reason === "string" ? reason : reason?.message;
    if (isStaleChunkError(msg)) reloadOnce(msg!);
  });
};
