import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { onDecisionApproved } from "@/lib/decision-lifecycle";
import { useToast } from "@/hooks/use-toast";
import type { EnrichedDecision } from "./DecisionQueue";

interface ModifyDecisionDialogProps {
  decision: EnrichedDecision | null;
  organizationId: string;
  datasetId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Partial<EnrichedDecision>) => void;
}

const ModifyDecisionDialog = ({ decision, organizationId, datasetId, open, onOpenChange, onSaved }: ModifyDecisionDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDays, setDueDays] = useState("7");
  const [urgency, setUrgency] = useState<string>("medium");
  const [successMetrics, setSuccessMetrics] = useState("");
  const [rationale, setRationale] = useState("");

  // Reset fields when a new decision opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && decision) {
      setTitle(decision.title);
      setRecommendation(decision.recommendation?.recommendedAction ?? decision.recommendedAction);
      setOwner(decision.recommendation?.suggestedOwner ?? "");
      setDueDays(String(decision.costOfDelayResult?.recommendedActionWindowDays ?? 7));
      setUrgency(decision.urgency);
      setSuccessMetrics(decision.recommendation?.successMetrics?.join(", ") ?? "");
      setRationale("");
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!decision) return;
    setSaving(true);
    try {
      // Persist to decision_ledger as a modified decision — including full confidence lineage
      const { data: ledgerRow, error } = await supabase.from("decision_ledger").insert({
        organization_id: organizationId,
        recommended_action: recommendation,
        chosen_action: recommendation,
        decided_by: user?.id,
        decided_at: new Date().toISOString(),
        decision_status: "approved",
        decision_type: "strategic",
        confidence_at_decision: decision.confidence ?? 50,
        raw_confidence: decision.rawConfidence ?? null,
        capped_confidence: decision.cappedConfidence ?? null,
        confidence_cap_reason: decision.confidenceCapReason ?? null,
        notes: [
          rationale ? `Rationale: ${rationale}` : null,
          `Owner: ${owner}`,
          `Due: ${dueDays}d`,
          `Urgency: ${urgency}`,
          successMetrics ? `Success metrics: ${successMetrics}` : null,
          `Modified from: ${decision.title}`,
        ].filter(Boolean).join(" | "),
      }).select("id").single();
      if (error) throw error;

      // Lifecycle side effects: audit log + execution plan + outcome
      if (ledgerRow?.id) {
        const primaryMetric = successMetrics ? successMetrics.split(",")[0].trim().toLowerCase().replace(/\s+/g, "_") : null;
        await onDecisionApproved({
          decisionId: ledgerRow.id,
          organizationId,
          userId: user?.id ?? null,
          recommendedAction: recommendation,
          confidence: decision.cappedConfidence ?? decision.confidence ?? 50,
          datasetId: datasetId ?? null,
          expectedMetric: primaryMetric,
          evaluationWindowDays: parseInt(dueDays) || 30,
          suggestedOwner: owner,
        });
      }

      // If source is an advisory, update it too
      if (decision.type === "advisory" && decision.sourceId) {
        await supabase
          .from("advisory_instances")
          .update({
            status: "in_progress",
            assigned_to: user?.id,
            action: recommendation,
          })
          .eq("id", decision.sourceId)
          .eq("organization_id", organizationId);
      }

      if (decision.type === "signal" && decision.sourceId) {
        await supabase
          .from("insights")
          .update({ is_read: true })
          .eq("id", decision.sourceId)
          .eq("organization_id", organizationId);
      }

      onSaved({
        ...decision,
        title,
        recommendedAction: recommendation,
      });

      toast({ title: "Decision modified & logged", description: "Changes persisted with full audit trail." });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Modify Decision</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Decision Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 text-sm" />
          </div>

          <div>
            <Label className="text-xs">Recommendation</Label>
            <Textarea value={recommendation} onChange={e => setRecommendation(e.target.value)} className="mt-1 text-sm min-h-[80px]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Owner</Label>
              <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. VP Finance" className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Due (days)</Label>
              <Input type="number" value={dueDays} onChange={e => setDueDays(e.target.value)} min={1} max={90} className="mt-1 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger className="mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Success Metrics</Label>
            <Textarea value={successMetrics} onChange={e => setSuccessMetrics(e.target.value)} placeholder="Comma-separated KPIs to monitor" className="mt-1 text-sm min-h-[60px]" />
          </div>

          <div>
            <Label className="text-xs">Rationale / Notes</Label>
            <Textarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Why are you modifying this decision?" className="mt-1 text-sm min-h-[60px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} size="sm">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !recommendation.trim()} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save & Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModifyDecisionDialog;
