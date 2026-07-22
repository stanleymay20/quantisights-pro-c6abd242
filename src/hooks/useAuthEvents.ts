import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { captureError } from "@/lib/sentry";

export type AuthEventType =
  | "login"
  | "logout"
  | "failed_login"
  | "mfa_enroll"
  | "mfa_verify"
  | "mfa_challenge_fail"
  | "sso_login"
  | "session_revoke"
  | "password_reset"
  | "password_change"
  | "step_up_auth"
  | "step_up_fail"
  | "passkey_enroll"
  | "passkey_login"
  | "passkey_remove"
  | "account_delete"
  | "role_change"
  | "scim_provision"
  | "scim_deprovision";

interface LogEventOptions {
  eventType: AuthEventType;
  metadata?: Record<string, unknown>;
  riskScore?: number;
  /** Override user_id (e.g. for failed login before session exists) */
  userId?: string;
}

export function useAuthEvents() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();

  const logAuthEvent = useCallback(
    async ({ eventType, metadata = {}, riskScore, userId }: LogEventOptions) => {
      const effectiveUserId = userId || user?.id;
      if (!effectiveUserId) return;

      try {
        await supabase.from("auth_events").insert([{
          user_id: effectiveUserId,
          organization_id: currentOrgId,
          event_type: eventType,
          user_agent: navigator.userAgent,
          metadata: JSON.parse(JSON.stringify(metadata)),
          risk_score: riskScore,
        }]);
      } catch (err) {
        console.warn("Failed to log auth event:", eventType);
        captureError(
          err instanceof Error ? err : new Error(`Auth event logging failed: ${eventType}`),
          { eventType, context: "useAuthEvents" }
        );
      }
    },
    [user?.id, currentOrgId]
  );

  return { logAuthEvent };
}
