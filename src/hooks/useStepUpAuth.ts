import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthEvents } from "@/hooks/useAuthEvents";

export type SensitiveAction =
  | "export_data"
  | "retention_cleanup"
  | "connector_config"
  | "policy_change"
  | "role_change"
  | "delete_account"
  | "scim_config"
  | "session_revoke_all"
  | "passkey_remove"
  | "webhook_trigger"
  | "slack_send";

const STEP_UP_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

export function useStepUpAuth() {
  const { user } = useAuth();
  const { logAuthEvent } = useAuthEvents();
  const [pendingAction, setPendingAction] = useState<{
    action: SensitiveAction;
    label: string;
    onConfirm: () => void;
  } | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null);

  const isStepUpValid = useCallback(() => {
    if (!lastVerifiedAt) return false;
    return Date.now() - lastVerifiedAt < STEP_UP_VALIDITY_MS;
  }, [lastVerifiedAt]);

  const requireStepUp = useCallback(
    (action: SensitiveAction, label: string, onConfirm: () => void) => {
      if (isStepUpValid()) {
        onConfirm();
        return;
      }
      setPendingAction({ action, label, onConfirm });
    },
    [isStepUpValid]
  );

  const verifyPassword = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user?.email) return false;
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (error) {
          logAuthEvent({ eventType: "step_up_fail", metadata: { action: pendingAction?.action } });
          return false;
        }
        setLastVerifiedAt(Date.now());
        logAuthEvent({ eventType: "step_up_auth", metadata: { action: pendingAction?.action } });
        return true;
      } catch (err) {
        console.error("[StepUpAuth] MFA verification failed:", err);
        return false;
      }
    },
    [user?.email, pendingAction?.action, logAuthEvent]
  );

  const onVerified = useCallback(() => {
    setLastVerifiedAt(Date.now());
    if (pendingAction) {
      pendingAction.onConfirm();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const cancelStepUp = useCallback(() => {
    setPendingAction(null);
  }, []);

  return {
    requireStepUp,
    pendingAction,
    verifyPassword,
    onVerified,
    cancelStepUp,
    isStepUpValid,
  };
}
