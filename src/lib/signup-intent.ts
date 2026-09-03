import { supabase } from "@/integrations/supabase/client";

const SIGNUP_INTENT_KEY = "quantivis_verified_signup_intent";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export const beginVerifiedSignupIntent = async (): Promise<string> => {
  const { data, error } = await rpc("begin_signup_intent");
  if (error) throw new Error(error.message || "Could not start verified signup");
  if (typeof data !== "string" || !data) throw new Error("Signup verification token was not issued");
  localStorage.setItem(SIGNUP_INTENT_KEY, data);
  return data;
};

export const readVerifiedSignupIntent = (): string | null =>
  localStorage.getItem(SIGNUP_INTENT_KEY);

export const clearVerifiedSignupIntent = () => {
  localStorage.removeItem(SIGNUP_INTENT_KEY);
};

export const provisionVerifiedSignup = async (intentToken: string) => {
  const { data, error } = await rpc("provision_verified_signup", {
    p_intent_token: intentToken,
  });
  return { data, error };
};

export const hasVerifiedSignupProvenance = async (organizationId: string) => {
  const { data, error } = await rpc("has_verified_signup_provenance", {
    p_organization_id: organizationId,
  });
  if (error) return { verified: false, error };
  return { verified: data === true, error: null };
};
