import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MFAChallenge from "@/components/auth/MFAChallenge";
import MFAEnroll from "@/components/auth/MFAEnroll";

type MFAStatus = "loading" | "required_challenge" | "required_enroll" | "passed";

/**
 * ProtectedRoute
 *
 * Three-layer auth guard:
 *   1. Session — redirect to /login if no user
 *   2. MFA challenge — if user has enrolled MFA but hasn't verified this session (aal2)
 *   3. Org MFA enforcement — if the org requires MFA and user hasn't enrolled,
 *      show the enrollment flow rather than the app
 *
 * All error paths FAIL CLOSED — never grant access when the auth check errors.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>("loading");

  useEffect(() => {
    if (!user) {
      setMfaStatus("passed"); // Will redirect via !user check below
      return;
    }

    const checkMFA = async () => {
      try {
        // Step 1: check assurance level (has user verified MFA this session?)
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) {
          // Fail closed — Supabase returned an error
          console.error("[ProtectedRoute] AAL check error:", error);
          setMfaStatus("required_challenge");
          return;
        }

        // User has enrolled MFA but hasn't verified this session → challenge
        if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          setMfaStatus("required_challenge");
          return;
        }

        // Step 2: check org-level MFA enforcement
        const { data: orgSettings } = await supabase
          .rpc("get_my_org_security_settings")
          .maybeSingle();

        if (orgSettings?.require_mfa) {
          // Org requires MFA — check if user has enrolled any factor
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const hasEnrolled = (factors?.totp ?? []).some(f => f.status === "verified");
          if (!hasEnrolled) {
            setMfaStatus("required_enroll");
            return;
          }
        }

        setMfaStatus("passed");
      } catch (e: unknown) {
        // JS exception — fail CLOSED
        console.error("[ProtectedRoute] Auth check threw:", e instanceof Error ? e.message : e);
        setMfaStatus("required_challenge");
      }
    };

    checkMFA();
  }, [user]);

  if (loading || mfaStatus === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // User needs to complete MFA challenge (already enrolled, session not verified)
  if (mfaStatus === "required_challenge") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-full max-w-md p-8">
          <MFAChallenge onVerified={() => setMfaStatus("passed")} />
        </div>
      </div>
    );
  }

  // User must enroll MFA (org policy requires it, user hasn't set it up)
  if (mfaStatus === "required_enroll") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-full max-w-lg p-8 space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-[16px] font-semibold tracking-tight">Multi-Factor Authentication Required</h2>
            <p className="text-sm text-muted-foreground">
              Your organisation requires MFA for all members.
              Set up an authenticator app to continue.
            </p>
          </div>
          <MFAEnroll />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
