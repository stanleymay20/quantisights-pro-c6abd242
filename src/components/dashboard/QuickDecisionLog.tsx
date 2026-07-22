import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface QuickDecisionLogProps {
  organizationId: string;
  onLogged?: () => void;
}

const QuickDecisionLog = ({ organizationId, onLogged }: QuickDecisionLogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [action, setAction] = useState("");
  const [type, setType] = useState("strategic");
  const [confidence, setConfidence] = useState([65]);

  const handleSubmit = async () => {
    if (!action.trim() || !organizationId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("decision_ledger").insert({
        organization_id: organizationId,
        recommended_action: action.trim(),
        decision_type: type,
        decided_by: user?.id,
        confidence_at_decision: confidence[0],
        decision_status: "pending",
      });
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "Decision logged", description: "Your strategic call is now tracked." });
      setTimeout(() => {
        setExpanded(false);
        setSubmitted(false);
        setAction("");
        setConfidence([65]);
        onLogged?.();
      }, 1500);
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3 p-4 rounded-xl border border-success/20 bg-success/[0.04]"
      >
        <Check className="w-5 h-5 text-success" />
        <div>
          <p className="text-sm font-semibold text-success">Decision logged</p>
          <p className="text-xs text-muted-foreground">The system will track this call and measure your accuracy.</p>
        </div>
      </motion.div>
    );
  }

  if (!expanded) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.05] hover:border-primary/30 transition-all group"
      >
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm font-semibold">Log a strategic decision</p>
          <p className="text-xs text-muted-foreground">3 clicks. The system learns from every call you make.</p>
        </div>
        <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-xl border border-primary/20 bg-card/80 space-y-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Quick Decision Log</p>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Step 1: What */}
      <Input
        placeholder="What's the strategic call? (e.g., 'Expand into DACH market Q2')"
        value={action}
        onChange={e => setAction(e.target.value)}
        className="text-sm"
        autoFocus
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Step 2: Type */}
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strategic">Strategic</SelectItem>
            <SelectItem value="financial">Financial</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
            <SelectItem value="risk_mitigation">Risk Mitigation</SelectItem>
          </SelectContent>
        </Select>

        {/* Step 3: Confidence */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Confidence:</span>
          <Slider
            value={confidence}
            onValueChange={setConfidence}
            min={10}
            max={95}
            step={5}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-primary w-10 text-right">{confidence[0]}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground italic">
          Probability is a forecast, not a commitment
        </p>
        <Button
          onClick={handleSubmit}
          disabled={!action.trim() || submitting}
          size="sm"
          className="gap-2"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Log Decision
        </Button>
      </div>
    </motion.div>
  );
};

export default QuickDecisionLog;
