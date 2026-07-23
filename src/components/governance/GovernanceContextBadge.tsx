/**
 * Phase 6A — Governance Context Badge
 *
 * "Why did I receive this?" — surfaces the governance configuration that
 * produced an advisory / intervention / decision. Reads governance_context
 * JSON stamped by engines.
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Info } from "lucide-react";

export interface GovernanceContextLite {
  risk_appetite?: string;
  governance_model?: string;
  profile_version?: number;
  thresholds_applied?: Record<string, number>;
  approval_rules?: { required_approvals?: number; chain?: Array<{ approval_stage: string }> };
  context_pack?: string | null;
}

interface Props { context: GovernanceContextLite | null | undefined; }

const GovernanceContextBadge = ({ context }: Props) => {
  if (!context || !context.risk_appetite) return null;
  const chain = context.approval_rules?.chain?.map((s) => s.approval_stage).join(" → ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex">
          <Badge variant="outline" className="gap-1 cursor-help">
            <ShieldCheck className="w-3 h-3" /> Governance: {context.risk_appetite} · {context.governance_model}
            <Info className="w-3 h-3 opacity-60" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs space-y-2">
        <div className="font-semibold text-sm">Why did I receive this?</div>
        <div className="grid grid-cols-2 gap-y-1">
          <span className="text-muted-foreground">Risk appetite</span><span>{context.risk_appetite}</span>
          <span className="text-muted-foreground">Governance model</span><span>{context.governance_model}</span>
          {context.profile_version != null && (<>
            <span className="text-muted-foreground">Profile version</span><span>v{context.profile_version}</span>
          </>)}
          {context.context_pack && (<>
            <span className="text-muted-foreground">Context pack</span><span>{context.context_pack}</span>
          </>)}
          {context.approval_rules?.required_approvals != null && (<>
            <span className="text-muted-foreground">Approvals required</span><span>{context.approval_rules.required_approvals}</span>
          </>)}
          {chain && (<>
            <span className="text-muted-foreground">Approval chain</span><span>{chain}</span>
          </>)}
        </div>
        {context.thresholds_applied && Object.keys(context.thresholds_applied).length > 0 && (
          <div>
            <div className="font-semibold mt-2 mb-1">Thresholds applied</div>
            {Object.entries(context.thresholds_applied).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{String(v)}</span></div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default GovernanceContextBadge;
