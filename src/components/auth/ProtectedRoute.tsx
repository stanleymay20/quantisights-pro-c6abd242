import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MFAChallenge from "@/components/auth/MFAChallenge";
import MFAEnroll from "@/components/auth/MFAEnroll";

type MFAStatus = "loading" | "required_challenge" | "required_enroll" | "blocked" | "passed";

/**
 * ProtectedRoute
 *
 * Three-layer auth guard:
 *   1. Session — redirect to /login if no user
 *   2. MFA challenge — if user has enrolled MFA but hasn't verified this session (aal2)
 *   3. Org MFA enforcement — if the org requires MFA and user hasn't enrolled,
 *      show the enrollment flow rather than the app
 *
 * All error paths FAIL CLOSED — never grant access when the auth/policy check errors.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, signOut } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>("loading");
  const [mfaCheckVersion, setMfaCheckVersion] = useState(0);

  const retryMfaCheck = () => {
    setMfaStatus("loading");
    setMfaCheckVersion((version) => version + 1);
  };

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setMfaStatus("passed"); // Will redirect via !user check below
      return () => {
        cancelled = true;
      };
    }

    setMfaStatus("loading");

    const setStatus = (status: MFAStatus) => {
      if (!cancelled) setMfaStatus(status);
    };

    const blockOnUnknownSecurityState = (label: string, error: unknown) => {
      console.error(`[ProtectedRoute] ${label}:`, error);
      setStatus("blocked");
    };

    const checkMFA = async () => {
      try {
        // Step 1: check assurance level (has user verified MFA this session?)
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || !data) {
          blockOnUnknownSecurityState("AAL check failed", error ?? "missing AAL response");
          return;
        }

        // User has enrolled MFA but hasn't verified this session → challenge
        if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          setStatus("required_challenge");
          return;
        }

        // Step 2: check org-level MFA enforcement. Supabase RPC failures are
        // returned in `error`; they are not guaranteed to throw, so ignoring
        // this field would silently turn "policy unavailable" into "MFA off".
        const { data: orgSettings, error: orgSettingsError } = await supabase
          .rpc("get_my_org_security_settings")
          .maybeSingle();

        if (orgSettingsError) {
          blockOnUnknownSecurityState("Organisation security policy check failed", orgSettingsError);
          return;
        }

        if (orgSettings?.require_mfa) {
          // Org requires MFA — check if user has enrolled any verified factor.
          const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
          if (factorsError || !factors) {
            blockOnUnknownSecurityState("MFA factor check failed", factorsError ?? "missing factor response");
            return;
          }

          const hasEnrolled = (factors.totp ?? []).some((factor) => factor.status === "verified");
          if (!hasEnrolled) {
            setStatus("required_enroll");
            return;
          }
        }

        setStatus("passed");
      } catch (error: unknown) {
        // JS exception — fail CLOSED rather than guessing that policy is off.
        blockOnUnknownSecurityState(
          "Auth check threw",
          error instanceof Error ? error.message : error,
        );
      }
    };

    void checkMFA();

    return () => {
      cancelled = true;
    };
  }, [user, mfaCheckVersion]);

  if (loading || mfaStatus === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (mfaStatus === "blocked") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 space-y-5 text-center">
          <div className="space-y-2">
            <h2 className="text-[16px] font-semibold tracking-tight">Security check unavailable</h2>
            <p className="text-sm text-muted-foreground">
              Quantivis could not verify your organisation's authentication policy, so access is blocked rather than bypassing it.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={retryMfaCheck}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
            >
              Retry security check
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // User needs to complete MFA challenge (already enrolled, session not verified)
  if (mfaStatus === "required_challenge") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="w-full max-w-md p-8">
          <MFAChallenge onVerified={retryMfaCheck} />
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
          <MFAEnroll onStatusChange={retryMfaCheck} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
