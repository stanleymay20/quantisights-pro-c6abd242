import { useState } from "react";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import UpgradeModal from "@/components/UpgradeModal";

interface Props {
  feature: string;
  children: React.ReactNode;
  fallbackMessage?: string;
  requiredTier?: "growth" | "enterprise";
}

/**
 * Wraps a feature behind a subscription tier gate.
 * Shows an upgrade prompt + modal if the user's tier doesn't include the feature.
 */
const SubscriptionGate = ({ feature, children, fallbackMessage, requiredTier = "growth" }: Props) => {
  const { canAccess, loading } = useSubscriptionGate();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) return <>{children}</>;

  if (!canAccess(feature)) {
    return (
      <>
        <Card className="border-dashed border-2 border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[14px] font-semibold">
                {fallbackMessage || "This feature requires an upgrade"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Your current plan doesn't include this capability. Upgrade to unlock it.
              </p>
            </div>
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              See what's included
            </Button>
          </CardContent>
        </Card>
        <UpgradeModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          feature={fallbackMessage || feature}
          requiredTier={requiredTier}
        />
      </>
    );
  }

  return <>{children}</>;
};

export default SubscriptionGate;
