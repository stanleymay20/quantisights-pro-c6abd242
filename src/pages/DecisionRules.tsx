/**
 * Decision Rules Table — DMN-style rule management (Book Ch.4)
 * 
 * Visual decision table for managing externalized rules.
 * Implements Fact-Rule-Action model with versioning and shadow deployment.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, GitBranch, Shield, Eye, EyeOff, Cpu, Beaker, Trash2, Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface DecisionRule {
  id: string;
  name: string;
  description: string | null;
  conditions: Json;
  actions: Json;
  priority: number;
  version: number;
  is_active: boolean;
  is_shadow: boolean;
  created_at: string;
  updated_at: string;
  organization_id: string;
}

const CONDITION_OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "in", label: "in list" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "contains", label: "contains" },
];

const FACT_FIELDS = [
  { value: "priority", label: "Priority" },
  { value: "category", label: "Category" },
  { value: "advisory_type", label: "Advisory Type" },
  { value: "confidence", label: "Confidence" },
  { value: "capped_confidence", label: "Capped Confidence" },
];

export default function DecisionRules() {
  const { orgId: organizationId } = useActiveDataContext();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["decision-rules", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("decision_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DecisionRule[];
    },
    enabled: !!organizationId,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("decision_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
      toast.success("Rule updated");
    },
  });

  const toggleShadow = useMutation({
    mutationFn: async ({ id, is_shadow }: { id: string; is_shadow: boolean }) => {
      const { error } = await supabase
        .from("decision_rules")
        .update({ is_shadow })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
      toast.success("Shadow mode updated");
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("decision_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
      toast.success("Rule deleted");
    },
  });

  const cloneRule = useMutation({
    mutationFn: async (rule: DecisionRule) => {
      const { error } = await supabase
        .from("decision_rules")
        .insert({
          organization_id: rule.organization_id,
          name: `${rule.name} (copy)`,
          description: rule.description,
          conditions: rule.conditions,
          actions: rule.actions,
          priority: rule.priority + 1,
          version: 1,
          is_active: false,
          is_shadow: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
      toast.success("Rule cloned as shadow");
    },
  });

  const productionRules = (rules ?? []).filter(r => !r.is_shadow);
  const shadowRules = (rules ?? []).filter(r => r.is_shadow);

  const formatConditions = (conditions: Json) => {
    if (!conditions || typeof conditions !== "object") return "—";
    const entries = Object.entries(conditions as Record<string, unknown>);
    return entries.map(([key, val]) => {
      if (typeof val === "object" && val !== null) {
        const op = Object.entries(val as Record<string, unknown>);
        return op.map(([opKey, opVal]) => `${key} ${opKey} ${JSON.stringify(opVal)}`).join(", ");
      }
      return `${key} = ${JSON.stringify(val)}`;
    }).join(" AND ");
  };

  const formatActions = (actions: Json) => {
    if (!actions || typeof actions !== "object") return "—";
    const entries = Object.entries(actions as Record<string, unknown>);
    return entries.map(([key, val]) => `${key}: ${val}`).join(", ");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Decision Rules Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            DMN-style decision table · Fact-Rule-Action model · DaaS pattern (Ch.4)
          </p>
        </div>
        <CreateRuleDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationId={organizationId}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["decision-rules"] });
            setCreateOpen(false);
          }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Rules", value: rules?.length ?? 0, icon: GitBranch },
          { label: "Production", value: productionRules.filter(r => r.is_active).length, icon: Shield },
          { label: "Shadow", value: shadowRules.length, icon: Beaker },
          { label: "Inactive", value: (rules ?? []).filter(r => !r.is_active).length, icon: EyeOff },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border/40 rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Production Rules Table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          Production Rulebase
        </h2>
        <RulesTable
          rules={productionRules}
          isLoading={isLoading}
          onToggleActive={(id, active) => toggleActive.mutate({ id, is_active: active })}
          onToggleShadow={(id, shadow) => toggleShadow.mutate({ id, is_shadow: shadow })}
          onDelete={(id) => deleteRule.mutate(id)}
          onClone={(rule) => cloneRule.mutate(rule)}
          formatConditions={formatConditions}
          formatActions={formatActions}
        />
      </div>

      {/* Shadow Rules Table */}
      {shadowRules.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Beaker className="w-4 h-4 text-amber-400" />
            Shadow Rules (A/B Testing)
          </h2>
          <p className="text-xs text-muted-foreground">
            Shadow rules execute against live traffic but do not affect production decisions. Discrepancies are logged for analysis.
          </p>
          <RulesTable
            rules={shadowRules}
            isLoading={false}
            onToggleActive={(id, active) => toggleActive.mutate({ id, is_active: active })}
            onToggleShadow={(id, shadow) => toggleShadow.mutate({ id, is_shadow: shadow })}
            onDelete={(id) => deleteRule.mutate(id)}
            onClone={(rule) => cloneRule.mutate(rule)}
            formatConditions={formatConditions}
            formatActions={formatActions}
            isShadow
          />
        </div>
      )}

      {/* Engine Info */}
      <div className="border border-border/30 rounded-lg p-4 bg-muted/20 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inference Engine</h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Strategy:</span> Priority-weighted first-match
          </div>
          <div>
            <span className="font-medium text-foreground">Conflict Resolution:</span> Specificity → Priority → Recency
          </div>
          <div>
            <span className="font-medium text-foreground">Pattern:</span> Forward Chaining (Rete-inspired)
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Rules Table Component ─── */

function RulesTable({
  rules,
  isLoading,
  onToggleActive,
  onToggleShadow,
  onDelete,
  onClone,
  formatConditions,
  formatActions,
  isShadow = false,
}: {
  rules: DecisionRule[];
  isLoading: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  onToggleShadow: (id: string, shadow: boolean) => void;
  onDelete: (id: string) => void;
  onClone: (rule: DecisionRule) => void;
  formatConditions: (c: Json) => string;
  formatActions: (a: Json) => string;
  isShadow?: boolean;
}) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading rules…</div>;
  }

  if (rules.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border/30 rounded-lg">
        No {isShadow ? "shadow" : "production"} rules defined. Create one to start the Decision-as-a-Service engine.
      </div>
    );
  }

  return (
    <div className="border border-border/30 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-12 text-[10px]">#</TableHead>
            <TableHead className="text-[10px]">RULE NAME</TableHead>
            <TableHead className="text-[10px]">WHEN (CONDITIONS)</TableHead>
            <TableHead className="text-[10px]">THEN (ACTIONS)</TableHead>
            <TableHead className="w-16 text-[10px]">VER</TableHead>
            <TableHead className="w-20 text-[10px]">ACTIVE</TableHead>
            <TableHead className="w-20 text-[10px]">SHADOW</TableHead>
            <TableHead className="w-24 text-[10px]">ACTIONS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule, i) => (
            <TableRow key={rule.id} className="hover:bg-muted/20">
              <TableCell className="font-mono text-xs text-muted-foreground">{rule.priority}</TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-foreground">{rule.name}</span>
                  {rule.description && (
                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{rule.description}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <code className="text-[10px] text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded font-mono">
                  {formatConditions(rule.conditions)}
                </code>
              </TableCell>
              <TableCell>
                <code className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-mono">
                  {formatActions(rule.actions)}
                </code>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[9px] font-mono">v{rule.version}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(checked) => onToggleActive(rule.id, checked)}
                />
              </TableCell>
              <TableCell>
                <Switch
                  checked={rule.is_shadow}
                  onCheckedChange={(checked) => onToggleShadow(rule.id, checked)}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Clone rule" className="h-6 w-6" onClick={() => onClone(rule)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete rule" className="h-6 w-6 text-destructive" onClick={() => onDelete(rule.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ─── Create Rule Dialog ─── */

function CreateRuleDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("10");
  const [condField, setCondField] = useState("priority");
  const [condOp, setCondOp] = useState("eq");
  const [condValue, setCondValue] = useState("");
  const [actionType, setActionType] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [isShadow, setIsShadow] = useState(false);

  const createRule = useMutation({
    mutationFn: async () => {
      if (!organizationId || !name) throw new Error("Missing fields");

      const conditions: Record<string, unknown> = {};
      if (condField && condValue) {
        if (condOp === "eq") {
          conditions[condField] = condValue;
        } else {
          const numVal = Number(condValue);
          conditions[condField] = { [condOp]: isNaN(numVal) ? condValue : numVal };
        }
      }

      const actions: Record<string, unknown> = {};
      if (actionType) actions.decision_type = actionType;
      if (actionValue) actions.recommended_action = actionValue;

      const { error } = await supabase
        .from("decision_rules")
        .insert({
          organization_id: organizationId,
          name,
          description: description || null,
          conditions: conditions as Json,
          actions: actions as Json,
          priority: parseInt(priority) || 10,
          is_shadow: isShadow,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule created");
      setName("");
      setDescription("");
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          New Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Decision Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Rule Name</Label>
            <Input placeholder="e.g. High Priority Revenue Alert" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea placeholder="What this rule does…" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority (lower = higher priority)</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={isShadow} onCheckedChange={setIsShadow} />
              <Label className="text-sm">Shadow Mode</Label>
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">WHEN (Condition)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={condField} onValueChange={setCondField}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FACT_FIELDS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={condOp} onValueChange={setCondOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Value" value={condValue} onChange={(e) => setCondValue(e.target.value)} />
            </div>
          </div>

          {/* Action */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">THEN (Action)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Decision type" value={actionType} onChange={(e) => setActionType(e.target.value)} />
              <Input placeholder="Recommended action" value={actionValue} onChange={(e) => setActionValue(e.target.value)} />
            </div>
          </div>

          <Button onClick={() => createRule.mutate()} disabled={!name || createRule.isPending} className="w-full">
            {createRule.isPending ? "Creating…" : "Create Rule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
