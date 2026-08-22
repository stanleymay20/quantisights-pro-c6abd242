import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionGate, type FeatureKey } from "@/hooks/useSubscriptionGate";
import { PILOT_TERMS } from "@/lib/pilot-terms";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import UpgradeModal from "@/components/UpgradeModal";

interface Props {
  feature: FeatureKey;
  children: React.ReactNode;
  fallbackMessage?: string;
  requiredTier?: "growth" | "enterprise";
}

/**
 * Wraps a feature behind a subscription tier gate. New organizations are sent
 * to the no-card evaluation path before we ask them to choose a paid plan.
 */
const SubscriptionGate = ({ feature, children, fallbackMessage, requiredTier = "growth" }: Props) => {
  const {
    canAccess,
    loading,
    subscribed,
    isPilot,
    isDemoUser,
    evidenceReady,
    error,
    refresh,
    hasSubscriptionRecord,
  } = useSubscriptionGate();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  if (isDemoUser) return <>{children}</>;

  if (loading) {
    return (
      <Card className="border-dashed border-2 border-primary/20">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-[14px] font-semibold">Verifying subscription access…</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Quantivis is verifying entitlement evidence for the active organization.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!evidenceReady || error) {
    return (
      <Card className="border-dashed border-2 border-destructive/20">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <div className="w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[14px] font-semibold">Subscription access unavailable</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Quantivis cannot currently verify this organization's entitlement. Protected capabilities remain locked until verification succeeds.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canAccess(feature)) {
    const canStartPilot = !hasSubscriptionRecord;
    const pilotEnded = hasSubscriptionRecord && !subscribed && isPilot;
    const subscriptionInactive = hasSubscriptionRecord && !subscribed && !isPilot;

    return (
      <>
        <Card className="border-dashed border-2 border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[14px] font-semibold">
                {canStartPilot
                  ? `Try this in your ${PILOT_TERMS.days}-day pilot`
                  : pilotEnded
                    ? "Your evaluation pilot has ended"
                    : subscriptionInactive
                      ? "Your subscription is not active"
                      : fallbackMessage || "This feature requires an upgrade"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {canStartPilot
                  ? `${PILOT_TERMS.tierLabel} pilot access requires no card and does not auto-renew. Experience the workflow before choosing a paid plan.`
                  : pilotEnded
                    ? "Choose a paid plan to keep using gated decision capabilities."
                    : subscriptionInactive
                      ? "Choose an active plan to use gated decision capabilities."
                      : "Your current access level doesn't include this capability. Choose the required plan to unlock it."}
              </p>
            </div>
            {canStartPilot || pilotEnded || subscriptionInactive ? (
              <Button onClick={() => navigate("/pricing")} className="gap-2">
                {canStartPilot ? `Start ${PILOT_TERMS.days}-Day Pilot` : "Choose a Plan"}
              </Button>
            ) : (
              <Button onClick={() => setModalOpen(true)} className="gap-2">
                See what's included
              </Button>
            )}
          </CardContent>
        </Card>
        {!canStartPilot && !pilotEnded && !subscriptionInactive && (
          <UpgradeModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            feature={fallbackMessage || feature}
            requiredTier={requiredTier}
          />
        )}
      </>
    );
  }

  return <>{children}</>;
};

export default SubscriptionGate;
