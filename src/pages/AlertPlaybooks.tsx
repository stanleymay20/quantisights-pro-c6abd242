import { useState, useEffect, useCallback } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Loader2, Play, Pause, Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  trigger_metric: string;
  trigger_condition: string;
  trigger_threshold: number;
  severity: string;
  escalation_steps: Array<any>;
  cooldown_minutes: number;
  is_active: boolean;
  last_triggered_at: string | null;
}

interface Execution {
  id: string;
  playbook_id: string;
  status: string;
  trigger_value: number | null;
  steps_completed: number;
  total_steps: number;
  started_at: string;
  completed_at: string | null;
}

const FALLBACK_METRICS = ["revenue", "customers", "cost", "churn"];
const CONDITIONS = [
  { value: "exceeds", label: "Exceeds threshold" },
  { value: "drops_below", label: "Drops below threshold" },
  { value: "changes_by", label: "Changes by %" },
];
const SEVERITIES = ["info", "warning", "critical"];

const SEVERITY_STYLES: Record<string, string> = {
  info: "text-primary bg-primary/10",
  warning: "text-warning bg-warning/10",
  critical: "text-destructive bg-destructive/10",
};

const AlertPlaybooks = () => {
  const { currentOrgId } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

  // Dynamically discover metric types
  useEffect(() => {
    if (!currentOrgId) { setLoading(false); return; }
    const fetchTypes = async () => {
      const { data } = await supabase
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", currentOrgId);
      if (data) {
        const types = [...new Set(data.map(r => r.metric_type))].sort();
        setAvailableMetrics(types.length > 0 ? types : FALLBACK_METRICS);
      }
    };
    fetchTypes();
  }, [currentOrgId]);

  const METRICS = availableMetrics.length > 0 ? availableMetrics : FALLBACK_METRICS;
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New playbook form
  const [pbName, setPbName] = useState("");
  const [pbDesc, setPbDesc] = useState("");
  const [pbMetric, setPbMetric] = useState("revenue");
  const [pbCondition, setPbCondition] = useState("exceeds");
  const [pbThreshold, setPbThreshold] = useState("100000");
  const [pbSeverity, setPbSeverity] = useState("warning");
  const [pbCooldown, setPbCooldown] = useState("60");
  const [pbSteps, setPbSteps] = useState('[\n  {"action": "notify_slack", "channel": "#alerts", "delay_minutes": 0},\n  {"action": "email_executive", "role": "cfo", "delay_minutes": 15},\n  {"action": "create_advisory", "priority": "high", "delay_minutes": 30}\n]');

  const fetchData = useCallback(async () => {
    if (!currentOrgId) { setLoading(false); return; }
    setLoading(true);
    const [pbRes, exRes] = await Promise.all([
      supabase.from("alert_playbooks").select("*").eq("organization_id", currentOrgId).order("created_at", { ascending: false }),
      supabase.from("playbook_executions").select("*").eq("organization_id", currentOrgId).order("started_at", { ascending: false }).limit(50),
    ]);
    setPlaybooks((pbRes.data || []).map((p: any) => ({ ...p, escalation_steps: Array.isArray(p.escalation_steps) ? p.escalation_steps : [] })));
    setExecutions(exRes.data || []);
    setLoading(false);
  }, [currentOrgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createPlaybook = async () => {
    if (!currentOrgId || !user || !pbName.trim()) return;
    setSaving(true);
    try {
      let steps: Array<any>;
      try { steps = JSON.parse(pbSteps); } catch { throw new Error("Invalid escalation steps JSON"); }

      const { error } = await supabase.from("alert_playbooks").insert({
        organization_id: currentOrgId,
        name: pbName.trim(),
        description: pbDesc.trim() || null,
        trigger_metric: pbMetric,
        trigger_condition: pbCondition,
        trigger_threshold: Number(pbThreshold),
        severity: pbSeverity,
        cooldown_minutes: Number(pbCooldown),
        escalation_steps: steps,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Playbook created" });
      setAddOpen(false);
      setPbName("");
      fetchData();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleActive = async (pb: Playbook) => {
    await supabase.from("alert_playbooks").update({ is_active: !pb.is_active }).eq("id", pb.id);
    fetchData();
  };

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Bell className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Alert Playbooks</h1>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> New Playbook</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Alert Playbook</DialogTitle></DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <Input placeholder="Playbook name" value={pbName} onChange={e => setPbName(e.target.value)} />
                <Input placeholder="Description (optional)" value={pbDesc} onChange={e => setPbDesc(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Select value={pbMetric} onValueChange={setPbMetric}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METRICS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={pbCondition} onValueChange={setPbCondition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input type="number" placeholder="Threshold" value={pbThreshold} onChange={e => setPbThreshold(e.target.value)} />
                  <Select value={pbSeverity} onValueChange={setPbSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="Cooldown (min)" value={pbCooldown} onChange={e => setPbCooldown(e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Escalation Steps (JSON)</p>
                  <Textarea value={pbSteps} onChange={e => setPbSteps(e.target.value)} rows={6} className="font-mono text-xs" />
                </div>
                <Button onClick={createPlaybook} disabled={saving || !pbName.trim()} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Playbook"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <SectionErrorBoundary sectionName="Alert Playbooks">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Zap className="w-8 h-8 text-primary" />
                <div><p className="text-xs text-muted-foreground">Active Playbooks</p><p className="text-2xl font-bold">{playbooks.filter(p => p.is_active).length}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-warning" />
                <div><p className="text-xs text-muted-foreground">Total Executions</p><p className="text-2xl font-bold">{executions.length}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-success" />
                <div><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold">{executions.filter(e => e.status === "completed").length}</p></div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : playbooks.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No playbooks configured. Create your first automated alert playbook.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {playbooks.map(pb => {
                const pbExecs = executions.filter(e => e.playbook_id === pb.id);
                return (
                  <Card key={pb.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold">{pb.name}</h3>
                            <Badge className={`text-[10px] ${SEVERITY_STYLES[pb.severity] || ""}`}>{pb.severity}</Badge>
                            <Badge variant={pb.is_active ? "default" : "secondary"} className="text-[10px]">
                              {pb.is_active ? "Active" : "Paused"}
                            </Badge>
                          </div>
                          {pb.description && <p className="text-xs text-muted-foreground mb-2">{pb.description}</p>}
                          <div className="flex gap-4 text-[10px] text-muted-foreground">
                            <span>Metric: <span className="text-foreground capitalize">{pb.trigger_metric}</span></span>
                            <span>Condition: <span className="text-foreground">{pb.trigger_condition.replace("_", " ")} {pb.trigger_threshold}</span></span>
                            <span>Cooldown: <span className="text-foreground">{pb.cooldown_minutes}m</span></span>
                            <span>Steps: <span className="text-foreground">{pb.escalation_steps?.length || 0}</span></span>
                          </div>
                          {pb.last_triggered_at && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Last triggered: {new Date(pb.last_triggered_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={pb.is_active} onCheckedChange={() => toggleActive(pb)} />
                        </div>
                      </div>

                      {pbExecs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/30 space-y-1">
                          <p className="text-[10px] text-muted-foreground font-semibold">Recent Executions</p>
                          {pbExecs.slice(0, 3).map(ex => (
                            <div key={ex.id} className="flex items-center gap-2 text-[10px]">
                              <Badge variant={ex.status === "completed" ? "default" : "secondary"} className="text-[9px]">{ex.status}</Badge>
                              <span className="text-muted-foreground">{ex.steps_completed}/{ex.total_steps} steps</span>
                              <span className="text-muted-foreground">{new Date(ex.started_at).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
        </SectionErrorBoundary>
    </>
  );
};

export default AlertPlaybooks;
