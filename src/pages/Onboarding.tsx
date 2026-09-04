import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type GateStatus = "checking" | "restoration" | "blocked";

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
  const refreshOrganizationsRef = useRef(refreshOrganizations);

  useEffect(() => {
    refreshOrganizationsRef.current = refreshOrganizations;
  }, [refreshOrganizations]);

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

      // Missing membership is never treated as permission to create a tenant.
      // Trusted signup provisioning and historical restoration are server-side
      // operations and must establish the relationship before this route opens.
      if (!currentOrgId) {
        setStatus("restoration");
        setDetail("Your identity is verified, but this environment is not linked to a verified Quantivis tenant.");
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

      // An incomplete organization is not sufficient evidence that the current
      // identity is a legitimate fresh signup. Client-editable user_metadata and
      // browser storage are deliberately not authorization inputs here.
      setStatus("restoration");
      setDetail("This organisation is incomplete but has no server-verified signup-onboarding provenance. Setup is blocked to avoid creating or overwriting replacement data.");
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
    orgError,
    orgLoading,
    user,
  ]);

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
                setStatus("checking");
                setDetail(null);
                void refreshOrganizationsRef.current();
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
