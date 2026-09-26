import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";

type CheckoutConfirmationResponse = {
  confirmed?: boolean;
  subscription_id?: string;
  tier?: string;
  billing_interval?: string;
  status?: string;
};

export function useCheckoutConfirmation() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const attemptedSession = useRef<string | null>(null);

  useEffect(() => {
    if (!user || searchParams.get("checkout") !== "success") return;

    const sessionId = searchParams.get("session_id")?.trim() || "";
    if (!sessionId.startsWith("cs_")) {
      if (attemptedSession.current !== "invalid") {
        attemptedSession.current = "invalid";
        toast({
          title: "Payment return could not be verified",
          description: "The checkout session reference is missing. Billing will remain fail-closed until Stripe reconciliation completes.",
          variant: "destructive",
        });
      }
      return;
    }

    if (attemptedSession.current === sessionId) return;
    attemptedSession.current = sessionId;

    let cancelled = false;
    void invokeWithRetry<CheckoutConfirmationResponse>("confirm-checkout", {
      body: { session_id: sessionId },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data?.confirmed) {
        toast({
          title: "Payment confirmation is still pending",
          description: error?.message || "Quantivis could not yet verify this Stripe Checkout session. Your billing state has not been guessed or elevated.",
          variant: "destructive",
        });
        return;
      }

      const cleaned = new URLSearchParams(searchParams);
      cleaned.delete("checkout");
      cleaned.delete("session_id");
      setSearchParams(cleaned, { replace: true });
      toast({
        title: "Payment confirmed",
        description: "Your Quantivis subscription is linked to this organisation.",
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      toast({
        title: "Payment confirmation is still pending",
        description: error instanceof Error ? error.message : "Quantivis could not yet verify this Stripe Checkout session.",
        variant: "destructive",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, toast, user]);
}
