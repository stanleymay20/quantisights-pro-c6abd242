import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import OnboardingWizard from "@/pages/OnboardingWizard";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { TIERS } from "@/lib/stripe-tiers";
import {
  clearCommercialSignupIntent,
  readCommercialSignupIntent,
} from "@/lib/commercial-intent";
import {
  clearVerifiedSignupIntent,
  hasVerifiedSignupProvenance,
  provisionVerifiedSignup,
  readVerifiedSignupIntent,
} from "@/lib/signup-intent";

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
  const [searchParams] = useSearchParams();
  const checkoutSucceeded = searchParams.get("checkout") === "success";
  const checkoutSessionId = searchParams.get("session_id")?.trim() || null;
  const [status, setStatus] = useState<GateStatus>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const provisioningAttempted = useRef(false);
  const checkoutLaunchAttempted = useRef(false);
  const checkoutConfirmationAttempted = useRef(false);
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

      if (!currentOrgId) {
        const intentToken = readVerifiedSignupIntent();
        if (!intentToken) {
          setStatus("restoration");
          setDetail("Your identity is verified, but this environment is not linked to a verified Quantivis tenant.");
          return;
        }

        if (provisioningAttempted.current) return;
        provisioningAttempted.current = true;
        setStatus("checking");
        setDetail(null);

        const { error } = await provisionVerifiedSignup(intentToken);
        if (cancelled) return;

        if (error) {
          const code = error.code || "";
          const message = error.message || "Verified signup provisioning failed.";
          if (code === "42501" || code === "22023") {
            clearVerifiedSignupIntent();
            clearCommercialSignupIntent();
          }
          setStatus(code === "42501" || code === "22023" ? "restoration" : "blocked");
          setDetail(
            message.includes("existing_identity_requires_restoration")
              ? "This identity already existed before the current signup attempt, so Quantivis will not create a replacement workspace."
              : message,
          );
          return;
        }

        try {
          await refreshOrganizationsRef.current();
        } catch (refreshError: unknown) {
          if (cancelled) return;
          provisioningAttempted.current = false;
          setStatus("blocked");
          setDetail(refreshError instanceof Error ? refreshError.message : "Workspace provisioning could not be verified.");
        }
        return;
      }

      // A Stripe redirect is not billing authority. Before onboarding can
      // continue, re-read that exact completed Checkout Session server-side and
      // materialize its trusted subscription into the tenant ledger.
      if (checkoutSucceeded) {
        if (!checkoutSessionId) {
          clearCommercialSignupIntent();
          setStatus("blocked");
          setDetail("Checkout returned without a verifiable Stripe session. No paid entitlement has been assumed.");
          return;
        }

        if (checkoutConfirmationAttempted.current) return;
        checkoutConfirmationAttempted.current = true;
        setStatus("checking");
        setDetail(null);

        const { data: confirmation, error: confirmationError } = await invokeWithRetry<{
          confirmed?: boolean;
          tier?: string;
          status?: string;
        }>("confirm-checkout", {
          body: { session_id: checkoutSessionId },
        });
        if (cancelled) return;

        if (confirmationError || !confirmation?.confirmed) {
          checkoutConfirmationAttempted.current = false;
          setStatus("blocked");
          setDetail(
            confirmationError?.message
              || "Stripe checkout completed in the browser, but Quantivis could not verify the subscription yet. Retry verification before continuing.",
          );
          return;
        }

        clearCommercialSignupIntent();
        navigate("/onboarding", { replace: true });
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
        clearVerifiedSignupIntent();
        clearCommercialSignupIntent();
        navigate("/executive", { replace: true });
        return;
      }

      const provenance = await hasVerifiedSignupProvenance(currentOrgId);
      if (cancelled) return;

      if (provenance.error) {
        setStatus("blocked");
        setDetail(provenance.error.message || "Quantivis could not verify signup provenance.");
        return;
      }

      if (provenance.verified) {
        const commercialIntent = readCommercialSignupIntent();
        if (commercialIntent) {
          if (checkoutLaunchAttempted.current) return;
          checkoutLaunchAttempted.current = true;
          setStatus("checking");
          setDetail(null);

          const tier = TIERS[commercialIntent.plan];
          const priceId = commercialIntent.billingInterval === "year"
            ? tier.price_id_annual
            : tier.price_id;

          if (!priceId) {
            checkoutLaunchAttempted.current = false;
            setStatus("blocked");
            setDetail("The selected billing interval is not configured for secure checkout.");
            return;
          }

          const { data: checkout, error: checkoutError } = await invokeWithRetry<{ url?: string }>("create-checkout", {
            body: { priceId },
          });
          if (cancelled) return;

          if (checkoutError || !checkout?.url) {
            checkoutLaunchAttempted.current = false;
            setStatus("blocked");
            setDetail(checkoutError?.message || "Secure checkout could not be started. No pilot was consumed.");
            return;
          }

          // Clear only after the server has created a trusted Checkout Session.
          // Cancelled checkout returns to /pricing, where the customer can choose
          // either a paid plan or the no-card pilot without a redirect loop.
          clearCommercialSignupIntent();
          window.location.assign(checkout.url);
          return;
        }

        clearVerifiedSignupIntent();
        setStatus("ready");
        setDetail(null);
        return;
      }

      setStatus("restoration");
      setDetail("This organisation is incomplete but has no server-verified signup-onboarding provenance. Setup is blocked to avoid creating or overwriting replacement data.");
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    checkoutSessionId,
    checkoutSucceeded,
    currentOrgId,
    evidenceReady,
    navigate,
    orgError,
    orgLoading,
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
              : "Quantivis could not safely verify the tenant or billing state, so access remains blocked rather than guessing."}
          </p>
          {detail && <p className="text-xs text-muted-foreground/80">{detail}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {!restoration && (
            <Button
              variant="outline"
              onClick={() => {
                provisioningAttempted.current = false;
                checkoutLaunchAttempted.current = false;
                checkoutConfirmationAttempted.current = false;
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
