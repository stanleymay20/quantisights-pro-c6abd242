import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  requiredTier?: "growth" | "enterprise";
}

const TIER_COPY = {
  growth: {
    title: "Upgrade to Growth",
    price: "€499/month",
    headline: "Unlock the full AI Decision Engine",
    bullets: [
      "AI Prescriptive Advisory",
      "Predictive Forecasting",
      "Monte Carlo Simulations",
      "Executive Copilot (500/mo)",
      "Board-ready PDF reports",
    ],
  },
  enterprise: {
    title: "Upgrade to Enterprise",
    price: "Custom — €18K–€72K/yr",
    headline: "Unlock governance, SSO, and command-center features",
    bullets: [
      "SSO (SAML 2.0) + RBAC",
      "Cognitive Bias Detection",
      "Multi-organization management",
      "Counterfactual analysis",
      "Dedicated success manager",
    ],
  },
};

const UpgradeModal = ({ open, onOpenChange, feature, requiredTier = "growth" }: UpgradeModalProps) => {
  const navigate = useNavigate();
  const copy = TIER_COPY[requiredTier];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Crown className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">{copy.title}</DialogTitle>
          <DialogDescription>
            {feature ? (
              <span><span className="font-semibold text-foreground">{feature}</span> requires the {requiredTier} plan.</span>
            ) : (
              copy.headline
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <div className="text-2xl font-bold tracking-tight">{copy.price}</div>
          <ul className="space-y-2">
            {copy.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Not now
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate(requiredTier === "enterprise" ? "/enterprise/contact" : "/pricing");
            }}
            className="flex-1 gap-2"
          >
            {requiredTier === "enterprise" ? "Contact sales" : "View plans"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeModal;
