import { useState, useEffect, useCallback } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Crosshair, Plus, Loader2, ChevronDown, ChevronRight, Target, CheckCircle2, AlertCircle } from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Objective {
  id: string;
  title: string;
  description: string | null;
  status: string;
  time_period: string;
  progress: number;
  parent_id: string | null;
  key_results?: KeyResult[];
}

interface KeyResult {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
  weight: number;
  kpi_id: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  on_track: "text-success bg-success/10",
  at_risk: "text-warning bg-warning/10",
  behind: "text-destructive bg-destructive/10",
  completed: "text-primary bg-primary/10",
  active: "text-foreground bg-muted",
};

// Hardcoding "2026" meant this list (and the default selection below) went
// stale the moment the calendar rolled past that year, and even within
// 2026 the default always pointed at Q1 regardless of the actual current
// quarter. Derive both from the real current date instead.
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_QUARTER = Math.floor(new Date().getMonth() / 3) + 1;
const TIME_PERIODS = [
  `Q1 ${CURRENT_YEAR}`, `Q2 ${CURRENT_YEAR}`, `Q3 ${CURRENT_YEAR}`, `Q4 ${CURRENT_YEAR}`,
  `H1 ${CURRENT_YEAR}`, `H2 ${CURRENT_YEAR}`, `FY ${CURRENT_YEAR}`,
];
const DEFAULT_TIME_PERIOD = `Q${CURRENT_QUARTER} ${CURRENT_YEAR}`;

const OKRs = () => {
  const { currentOrgId } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPeriod, setNewPeriod] = useState(DEFAULT_TIME_PERIOD);
  const [saving, setSaving] = useState(false);

  // Add KR state
  const [addKRFor, setAddKRFor] = useState<string | null>(null);
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("100");
  const [krUnit, setKrUnit] = useState("%");

  const fetchOKRs = useCallback(async () => {
    if (!currentOrgId) { setLoading(false); return; }
    setLoading(true);
    const [objRes, krRes] = await Promise.all([
      supabase.from("objectives").select("*").eq("organization_id", currentOrgId).order("created_at", { ascending: false }),
      supabase.from("key_results").select("*").eq("organization_id", currentOrgId),
    ]);
    const objs: Objective[] = (objRes.data || []).map((o: any) => ({
      ...o,
      key_results: (krRes.data || []).filter((kr: { objective_id?: string; [key: string]: unknown }) => kr.objective_id === o.id),
    }));
    setObjectives(objs);
    setLoading(false);
  }, [currentOrgId]);

  useEffect(() => { fetchOKRs(); }, [fetchOKRs]);

  const addObjective = async () => {
    if (!currentOrgId || !user || !newTitle.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("objectives").insert({
      organization_id: currentOrgId,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      time_period: newPeriod,
      owner_id: user.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Objective created" });
      setNewTitle("");
      setNewDesc("");
      setAddOpen(false);
      fetchOKRs();
    }
    setSaving(false);
  };

  const addKeyResult = async (objectiveId: string) => {
    if (!currentOrgId || !krTitle.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("key_results").insert({
      objective_id: objectiveId,
      organization_id: currentOrgId,
      title: krTitle.trim(),
      target_value: Number(krTarget),
      unit: krUnit,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Key Result added" });
      setKrTitle("");
      setKrTarget("100");
      setAddKRFor(null);
      fetchOKRs();
    }
    setSaving(false);
  };

  const updateKRProgress = async (krId: string, newValue: number) => {
    await supabase.from("key_results").update({ current_value: newValue }).eq("id", krId);
    fetchOKRs();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const overallProgress = objectives.length > 0
    ? objectives.reduce((s, o) => {
        const krs = o.key_results || [];
        if (krs.length === 0) return s;
        const totalWeight = krs.reduce((tw, kr) => tw + kr.weight, 0);
        const wp = krs.reduce((wt, kr) => wt + (kr.target_value > 0 ? (kr.current_value / kr.target_value) * kr.weight : 0), 0);
        return s + (wp / totalWeight) * 100;
      }, 0) / objectives.length
    : 0;

  return (
    <DatasetRequired moduleName="OKRs">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Crosshair className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">OKR Alignment</h1>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Objective</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Objective</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Objective title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                <Select value={newPeriod} onValueChange={setNewPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={addObjective} disabled={saving || !newTitle.trim()} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Objective"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Overall Progress */}
          <Card>
            <CardContent className="p-6 flex items-center gap-6">
              <div className="shrink-0">
                <p className="text-xs text-muted-foreground mb-1">Overall OKR Progress</p>
                <p className="text-3xl font-bold">{overallProgress.toFixed(0)}%</p>
              </div>
              <Progress value={overallProgress} className="flex-1 h-3" />
              <Badge className="shrink-0">{objectives.length} Objectives</Badge>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : objectives.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No objectives yet. Create your first strategic objective to get started.</CardContent></Card>
          ) : (
            objectives.map(obj => {
              const isExpanded = expandedIds.has(obj.id);
              const krs = obj.key_results || [];
              const objProgress = krs.length > 0
                ? krs.reduce((s, kr) => s + (kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0), 0) / krs.length
                : 0;

              return (
                <Card key={obj.id}>
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleExpand(obj.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <CardTitle className="text-sm">{obj.title}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{obj.time_period}</Badge>
                        <Badge className={`text-[10px] ${STATUS_COLORS[obj.status] || ""}`}>{obj.status}</Badge>
                        <span className="text-xs font-mono text-muted-foreground">{objProgress.toFixed(0)}%</span>
                      </div>
                    </div>
                    <Progress value={objProgress} className="h-1.5 mt-2" />
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-3 pt-0">
                      {obj.description && <p className="text-xs text-muted-foreground">{obj.description}</p>}

                      {krs.map(kr => {
                        const pct = kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0;
                        return (
    <SectionErrorBoundary sectionName="OKRs">
                          <div key={kr.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            {pct >= 100 ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> : <Target className="w-4 h-4 text-primary shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{kr.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Progress value={Math.min(pct, 100)} className="flex-1 h-1.5" />
                                <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                  {kr.current_value}/{kr.target_value} {kr.unit}
                                </span>
                              </div>
                            </div>
                            <Input
                              type="number"
                              className="w-20 h-7 text-xs"
                              value={kr.current_value}
                              onChange={e => updateKRProgress(kr.id, Number(e.target.value))}
                            />
                          </div>
    </SectionErrorBoundary>
                        );
                      })}

                      {addKRFor === obj.id ? (
                        <div className="flex gap-2 items-end p-3 rounded-lg border border-dashed border-border">
                          <div className="flex-1">
                            <Input placeholder="Key Result title" value={krTitle} onChange={e => setKrTitle(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <Input type="number" value={krTarget} onChange={e => setKrTarget(e.target.value)} className="w-20 h-8 text-xs" placeholder="Target" />
                          <Input value={krUnit} onChange={e => setKrUnit(e.target.value)} className="w-16 h-8 text-xs" placeholder="Unit" />
                          <Button size="sm" onClick={() => addKeyResult(obj.id)} disabled={saving} className="h-8">Add</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddKRFor(null)} className="h-8">Cancel</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setAddKRFor(obj.id)}>
                          <Plus className="w-3 h-3" /> Add Key Result
                        </Button>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </main>
    </>
    </DatasetRequired>
  );
};

export default OKRs;
