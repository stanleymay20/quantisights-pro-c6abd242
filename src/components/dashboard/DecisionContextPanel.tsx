import { useState, memo } from "react";
import { Crosshair, Plus, Target, Archive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DECISION_TYPES,
  type DecisionContext,
  type CreateDecisionContextInput,
} from "@/hooks/useDecisionContexts";
import { useToast } from "@/hooks/use-toast";

interface DecisionContextPanelProps {
  activeContext: DecisionContext | null;
  onContextChange: (ctx: DecisionContext | null) => void;
  contexts: DecisionContext[];
  onCreateContext: (input: CreateDecisionContextInput) => Promise<DecisionContext | null>;
  onArchiveContext: (id: string) => Promise<void>;
}

const typeLabel = (type: string) =>
  DECISION_TYPES.find(t => t.value === type)?.label ?? type.replace(/_/g, " ");

const DecisionContextPanel = memo(({
  activeContext,
  onContextChange,
  contexts,
  onCreateContext,
  onArchiveContext,
}: DecisionContextPanelProps) => {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateDecisionContextInput>({
    name: "",
    decision_type: "general",
    description: "",
    objective: "",
    industry: "",
  });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const ctx = await onCreateContext(form);
      if (ctx) {
        onContextChange(ctx);
        setShowCreate(false);
        setForm({ name: "", decision_type: "general", description: "", objective: "", industry: "" });
        toast({ title: "Decision context created" });
      }
    } catch (err: unknown) {
      toast({ title: "Failed to create context", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const targetMetrics = Array.isArray(activeContext?.target_metrics)
    ? (activeContext.target_metrics as string[])
    : [];

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" /> Decision Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Active context display */}
        {activeContext ? (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/[0.03] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{activeContext.name}</h3>
              <Badge variant="outline" className="text-[9px] capitalize">{typeLabel(activeContext.decision_type)}</Badge>
            </div>
            {activeContext.objective && (
              <p className="text-xs text-muted-foreground leading-relaxed">{activeContext.objective}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {activeContext.industry && (
                <Badge variant="secondary" className="text-[9px]">{activeContext.industry}</Badge>
              )}
              {targetMetrics.slice(0, 3).map(m => (
                <Badge key={m} variant="outline" className="text-[9px]">
                  <Target className="w-2.5 h-2.5 mr-0.5" />{m}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <Crosshair className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p className="text-xs text-muted-foreground">No active decision context. Select or create one to scope analysis.</p>
          </div>
        )}

        {/* Context selector */}
        <div className="flex gap-2">
          <Select
            value={activeContext?.id ?? ""}
            onValueChange={(val) => {
              const ctx = contexts.find(c => c.id === val) ?? null;
              onContextChange(ctx);
            }}
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="Select decision context..." />
            </SelectTrigger>
            <SelectContent>
              {contexts.map(ctx => (
                <SelectItem key={ctx.id} value={ctx.id} className="text-xs">
                  <span className="font-medium">{ctx.name}</span>
                  <span className="text-muted-foreground ml-2">({typeLabel(ctx.decision_type)})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2" aria-label="Create decision context">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">Create Decision Context</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Market Expansion – West Africa"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Decision Type</Label>
                  <Select value={form.decision_type} onValueChange={v => setForm(f => ({ ...f, decision_type: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DECISION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Objective</Label>
                  <Textarea
                    value={form.objective}
                    onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
                    placeholder="What are you trying to decide?"
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Industry</Label>
                  <Input
                    value={form.industry}
                    onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                    placeholder="e.g. Fintech, Healthcare"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">Cancel</Button>
                </DialogClose>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create Context"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Archive action for active context */}
        {activeContext && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[10px] text-muted-foreground hover:text-destructive"
              >
                <Archive className="w-3 h-3 mr-1" /> Archive this context
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive "{activeContext.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This context will be archived and removed from active analysis. Decisions already linked to it will retain their association for audit purposes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await onArchiveContext(activeContext.id);
                      onContextChange(null);
                      toast({ title: "Context archived" });
                    } catch (err: unknown) {
                      toast({ title: "Archive failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
                    }
                  }}
                >
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
});

DecisionContextPanel.displayName = "DecisionContextPanel";

export default DecisionContextPanel;
