import { supabase } from "@/integrations/supabase/client";

/**
 * Create a Supabase Realtime channel with a per-call unique topic suffix so
 * the same channel object can never be re-used across StrictMode remounts or
 * concurrent hook instances. Wraps setup in try/catch so a Realtime failure
 * (e.g. "cannot add postgres_changes callbacks after subscribe()") can never
 * crash the calling component/route.
 *
 * Returns a cleanup function safe to call unconditionally.
 */
export function createSafeChannel(
  baseName: string,
  setup: (channel: ReturnType<typeof supabase.channel>) => ReturnType<typeof supabase.channel>,
): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    const uniq = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    channel = setup(supabase.channel(`${baseName}-${uniq}`));
  } catch (err) {
    console.warn(`[realtime] channel setup failed for ${baseName}:`, err);
  }
  return () => {
    if (!channel) return;
    try {
      supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}
