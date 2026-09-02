import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import OnboardingWizard from "@/pages/OnboardingWizard";

const ONBOARDING_PROVISION_KEY = "quantivis_onboarding_provisioning";

type GateStatus = "checking" | "ready" | "restoration" | "blocked";

const Onboarding = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    currentOrgId,
    loading: orgLoading,
    error: orgError,
    evidenceReady,
    refreshOrganizations,
  } = useOrganization();
  const navigate = useNavigate();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const provisioningAttempted = useRef(false);

  const onboardingStarted = user?.user_metadata?.quantivis_onboarding_started === true;
  const onboardingProvisioned = user?.user_metadata?.quantivis_onboarding_provisioned === true;

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (authLoading || orgLoading) return;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      if (orgError || !evidenceReady) {
        setStatus("blocked");
        setDetail(orgError || "Quantivis could not verify your organisation membership.");
        return;
      }

      if (!currentOrgId) {
        if (!onboardingStarted) {
          setStatus("restoration");
          setDetail("Your identity is verified, but this environment is not linked to a verified Quantivis tenant.");
          return;
        }

        if (provisioningAttempted.current) return;
        provisioningAttempted.current = true;
        setStatus("checking");
        sessionStorage.setItem(ONBOARDING_PROVISION_KEY, "allowed");
        try {
          await refreshOrganizations();
        } catch (refreshError: unknown) {
          if (cancelled) return;
          setStatus("blocked");
          setDetail(refreshError instanceof Error ? refreshError.message : "Workspace provisioning could not be verified.");
        } finally {
          sessionStorage.removeItem(ONBOARDING_PROVISION_KEY);
        }
        return;
      }

      const { data, error } = await supabase
        .from("organizations")
        .select("onboarding_completed")
        .eq("id", currentOrgId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setStatus("blocked");
        setDetail(error?.message || "Quantivis could not verify onboarding state for this organisation.");
        return;
      }

      if (data.onboarding_completed) {
        navigate("/executive", { replace: true });
        return;
      }

      if (onboardingStarted || onboardingProvisioned) {
        setStatus("ready");
        setDetail(null);
        return;
      }

      setStatus("restoration");
      setDetail("This organisation is incomplete but has no verified signup-onboarding provenance. Setup is blocked to avoid creating replacement data.");
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    currentOrgId,
    evidenceReady,
    navigate,
    onboardingProvisioned,
    onboardingStarted,
    orgError,
    orgLoading,
    refreshOrganizations,
    user,
  ]);

  if (status === "ready") return <OnboardingWizard />;

  if (status === "checking") {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const restoration = status === "restoration";
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {restoration ? "Workspace restoration required" : "Workspace verification unavailable"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {restoration
              ? "Your identity is verified, but Quantivis will not create or overwrite organisation data until the tenant relationship is verified."
              : "Quantivis could not safely verify the tenant state, so access remains blocked rather than guessing."}
          </p>
          {detail && <p className="text-xs text-muted-foreground/80">{detail}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {!restoration && (
            <Button
              variant="outline"
              onClick={() => {
                provisioningAttempted.current = false;
                setStatus("checking");
                setDetail(null);
                void refreshOrganizations();
              }}
            >
              Retry verification
            </Button>
          )}
          <Button variant={restoration ? "default" : "secondary"} onClick={() => navigate("/status")}>View system status</Button>
          <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
