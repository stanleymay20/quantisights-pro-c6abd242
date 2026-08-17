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
  const { canAccess, loading, subscribed, isPilot } = useSubscriptionGate();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) return <>{children}</>;

  if (!canAccess(feature)) {
    const canStartPilot = !subscribed && !isPilot;
    const pilotEnded = !subscribed && isPilot;

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
                    : fallbackMessage || "This feature requires an upgrade"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {canStartPilot
                  ? `${PILOT_TERMS.tierLabel} pilot access requires no card and does not auto-renew. Experience the workflow before choosing a paid plan.`
                  : pilotEnded
                    ? "Choose a paid plan to keep using gated decision capabilities."
                    : "Your current access level doesn't include this capability. Choose the required plan to unlock it."}
              </p>
            </div>
            {canStartPilot || pilotEnded ? (
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
        {!canStartPilot && !pilotEnded && (
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
