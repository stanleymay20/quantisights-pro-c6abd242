/**
 * Canonical auth helper — single source of truth for verified auth + token retrieval.
 * Replaces all duplicated getVerifiedAuth() implementations across hooks.
 */
import { supabase } from "@/integrations/supabase/client";

export interface VerifiedAuth {
  token: string;
  userId: string;
}

/**
 * Get verified user identity + access token for privileged operations.
 * Uses getUser() for server-verified identity, then getSession() only for the token.
 */
export async function getVerifiedAuth(): Promise<VerifiedAuth | null> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { token: session.access_token, userId: user.id };
}

/**
 * Build Authorization headers from a verified auth result.
 */
export function authHeaders(auth: VerifiedAuth): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}` };
}
