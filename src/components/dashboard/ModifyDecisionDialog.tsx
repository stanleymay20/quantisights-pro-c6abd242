import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { createAndApproveQueueDecision, type QueueApprovalSourceType } from "@/lib/decision-queue-approval";
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
      const primaryMetric = successMetrics
        ? successMetrics.split(",")[0].trim().toLowerCase().replace(/\s+/g, "_")
        : null;
      const sourceType: QueueApprovalSourceType =
        decision.type === "advisory" ? "advisory" :
        decision.type === "signal" ? "signal" :
        null;

      // Modified decisions use the same atomic server lifecycle as direct queue
      // approvals: pending insert -> approve_decision -> source resolution.
      await createAndApproveQueueDecision({
        organizationId,
        recommendedAction: recommendation,
        confidence: decision.cappedConfidence ?? decision.confidence ?? 50,
        rawConfidence: decision.rawConfidence ?? decision.confidence ?? null,
        cappedConfidence: decision.cappedConfidence ?? decision.confidence ?? null,
        confidenceCapReason: decision.confidenceCapReason ?? null,
        notes: [
          rationale ? `Rationale: ${rationale}` : null,
          `Owner: ${owner}`,
          `Due: ${dueDays}d`,
          `Urgency: ${urgency}`,
          successMetrics ? `Success metrics: ${successMetrics}` : null,
          `Modified from: ${decision.title}`,
        ].filter(Boolean).join(" | "),
        datasetId: decision.sourceDatasetId ?? datasetId ?? null,
        expectedMetric: primaryMetric,
        evaluationWindowDays: parseInt(dueDays) || 30,
        suggestedOwner: owner || null,
        sourceType,
        sourceId: sourceType ? (decision.sourceId ?? null) : null,
      });

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
