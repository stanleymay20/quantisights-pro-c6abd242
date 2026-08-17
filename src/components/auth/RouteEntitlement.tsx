import SubscriptionGate from "@/components/SubscriptionGate";
import { FEATURE_TIERS, requiredTierFor, type FeatureKey } from "@/hooks/useSubscriptionGate";

const LABELS: Partial<Record<FeatureKey, string>> = {
  simulations: "Monte Carlo simulations",
  forecasting: "Predictive forecasting",
  advisory: "Prescriptive advisory",
  causalInference: "Causal inference",
  benchmarking: "Industry benchmarking",
  alertPlaybooks: "Alert playbooks",
  okrAlignment: "OKR alignment",
  aicisIntegration: "AICIS signal integration",
  dataLineage: "Data lineage & provenance",
  marketIntelligence: "Market intelligence signals",
  biasDetection: "Cognitive bias detection",
  counterfactual: "Counterfactual explanations",
  scenarioBranching: "Scenario branching & war room",
  sso: "SSO & enterprise identity",
};

/**
 * Route-level entitlement boundary.
 *
 * Direct URL access to a paid capability must not bypass the plan the customer
 * is actually on. Backend edge functions enforce the same keys independently —
 * this layer only removes the misleading UI surface.
 */
const RouteEntitlement = ({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) => {
  if (!FEATURE_TIERS[feature]) return <>{children}</>;
  return (
    <SubscriptionGate
      feature={feature}
      fallbackMessage={LABELS[feature] ?? feature}
      requiredTier={requiredTierFor(feature)}
    >
      {children}
    </SubscriptionGate>
  );
};

export default RouteEntitlement;
