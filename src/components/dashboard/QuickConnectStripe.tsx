import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Zap, ArrowRight, ExternalLink } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";

/**
 * QuickConnectStripe — 60-second path from no data to live Stripe MRR, revenue,
 * and churn metrics in the Quantivis dashboard.
 *
 * Used in the DashboardEmptyState and the onboarding flow for new orgs.
 * Uses the restricted Stripe API key pattern (read-only by design).
 */
const QuickConnectStripe = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [step, setStep] = useState<"idle" | "saving" | "syncing" | "done" | "error">("idle");
  const [records, setRecords] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const isValid = apiKey.startsWith("rk_") || apiKey.startsWith("sk_");

  const handleConnect = async () => {
    if (!currentOrgId || !isValid) return;
    setStep("saving");
    setErrorMsg("");

    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Authentication required");

      // Step 1: Store credentials in Vault
      const storeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connector-credential-store`,
        {
          method: "POST",
          headers: authHeaders(auth),
          body: JSON.stringify({
            organization_id: currentOrgId,
            connector_type: "stripe",
            name: "Stripe Payments",
            credentials: { stripeApiKey: apiKey },
            schedule_kind: "hourly",
          }),
        }
      );
      const storeData = await storeRes.json();
      if (!storeData.success) throw new Error(storeData.error || "Failed to save Stripe API key");

      setStep("syncing");

      // Step 2: Trigger initial sync
      const syncRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connector-pull`,
        {
          method: "POST",
          headers: authHeaders(auth),
          body: JSON.stringify({
            connector_type: "stripe",
            data_source_id: storeData.connector_id,
            organization_id: currentOrgId,
            connector_id: storeData.connector_id,
          }),
        }
      );
      const syncData = await syncRes.json();

      if (syncData.errors?.length > 0 && syncData.records === 0) {
        throw new Error(syncData.errors[0] || "Stripe sync failed");
      }

      setRecords(syncData.records ?? 0);
      setStep("done");
      toast({
        title: "Stripe connected",
        description: `${syncData.records ?? 0} metrics synced. Your revenue, MRR, and churn are now live.`,
      });
      setTimeout(() => {
        onSuccess?.();
        navigate("/dashboard");
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setErrorMsg(msg);
      setStep("error");
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.01]">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Connect Stripe in 60 seconds</p>
            <p className="text-xs text-muted-foreground">Revenue, MRR, and churn metrics appear immediately.</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === "done" ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <div>
                <p className="text-sm font-medium text-success">Connected — {records} metrics synced</p>
                <p className="text-xs text-muted-foreground">Taking you to your live dashboard…</p>
              </div>
            </motion.div>
          ) : step === "syncing" ? (
            <motion.div key="syncing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Pulling revenue, subscriptions, and churn from Stripe…</p>
            </motion.div>
          ) : step === "saving" ? (
            <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Encrypting API key in Vault…</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {step === "error" && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                  Stripe Restricted API Key
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Get key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <Input
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="rk_live_... (read-only restricted key)"
                  type="password"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Create a Restricted Key in Stripe Dashboard → Developers → API Keys.
                  Enable read permissions for: Charges, Customers, Subscriptions, Invoices.
                </p>
              </div>
              <Button
                className="w-full gap-2"
                disabled={!isValid}
                onClick={handleConnect}
              >
                Connect Stripe & Sync Data <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};

export default QuickConnectStripe;
