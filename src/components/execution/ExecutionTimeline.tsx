import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Play, CheckCircle2, XCircle, Clock, AlertTriangle,
  Webhook, MessageSquare, ArrowRight, Loader2, ChevronDown, Shield,
} from "lucide-react";
import { useExecutionPlans, type ExecutionPlan } from "@/hooks/useExecutionPlans";
import { usePermissions } from "@/hooks/usePermissions";
import { useStepUpAuth } from "@/hooks/useStepUpAuth";
import StepUpAuthDialog from "@/components/auth/StepUpAuthDialog";
import { formatDistanceToNow } from "date-fns";

interface ExecutionTimelineProps {
  organizationId: string;
  decisionId: string;
  decisionTitle: string;
}

const STATUS_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  in_progress: { icon: Play, color: "text-primary", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-success", label: "Completed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  cancelled: { icon: AlertTriangle, color: "text-warning", label: "Cancelled" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning border-warning/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

const PlanCard = ({ plan, onStatusChange, onWebhook, onSlack, canTriggerActions }: {
  plan: ExecutionPlan;
  onStatusChange: (id: string, status: string) => void;
  onWebhook: (id: string) => void;
  onSlack: (id: string) => void;
  canTriggerActions: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[plan.status] || STATUS_META.pending;
  const Icon = meta.icon;
  const isOverdue = plan.deadline && new Date(plan.deadline) < new Date() && plan.status !== "completed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
      <div className={`absolute left-2.5 top-4 w-3 h-3 rounded-full border-2 ${
        plan.status === "completed" ? "bg-success border-success" :
        plan.status === "failed" ? "bg-destructive border-destructive" :
        plan.status === "in_progress" ? "bg-primary border-primary" :
        "bg-background border-border"
      }`} />

      <div className="ml-8">
        <Card className={`${isOverdue ? "border-destructive/40" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon className={`w-4 h-4 ${meta.color} shrink-0`} />
                  <span className="font-medium text-sm truncate">{plan.action_title}</span>
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[plan.priority] || PRIORITY_COLORS.medium}`}>
                    {plan.priority}
                  </Badge>
                  {isOverdue && (
                    <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                  )}
                </div>
                {plan.action_description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.action_description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  {plan.deadline && (
                    <span>Due {formatDistanceToNow(new Date(plan.deadline), { addSuffix: true })}</span>
                  )}
                  <span>Created {formatDistanceToNow(new Date(plan.created_at), { addSuffix: true })}</span>
                </div>
              </div>

              <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-secondary/50">
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            </div>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-2">
                    {plan.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => onStatusChange(plan.id, "in_progress")} className="gap-1.5 text-xs">
                        <Play className="w-3 h-3" /> Start
                      </Button>
                    )}
                    {plan.status === "in_progress" && (
                      <>
                        <Button size="sm" onClick={() => onStatusChange(plan.id, "completed")} className="gap-1.5 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => onStatusChange(plan.id, "failed")} className="gap-1.5 text-xs">
                          <XCircle className="w-3 h-3" /> Failed
                        </Button>
                      </>
                    )}
                    {canTriggerActions ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onWebhook(plan.id)} className="gap-1.5 text-xs">
                          <Webhook className="w-3 h-3" /> Webhook
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onSlack(plan.id)} className="gap-1.5 text-xs">
                          <MessageSquare className="w-3 h-3" /> Slack
                        </Button>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Admin required for integrations
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
};

const ExecutionTimeline = ({ organizationId, decisionId, decisionTitle }: ExecutionTimelineProps) => {
  const {
    plans, events, loading, error, evidenceReady, createPlan, updatePlanStatus,
    triggerWebhook, notifySlack, completionRate,
  } = useExecutionPlans(organizationId, decisionId);

  const { orgRole } = usePermissions();
  const canTriggerActions = orgRole === "owner" || orgRole === "admin";
  const { requireStepUp, pendingAction, verifyPassword, onVerified, cancelStepUp } = useStepUpAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDeadline, setNewDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  // Webhook modal state
  const [webhookModal, setWebhookModal] = useState<{ planId: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSending, setWebhookSending] = useState(false);

  // Slack modal state
  const [slackModal, setSlackModal] = useState<{ planId: string } | null>(null);
  const [slackChannel, setSlackChannel] = useState("");
  const [slackSending, setSlackSending] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim() || !evidenceReady) return;
    setCreating(true);
    const created = await createPlan({
      action_title: newTitle,
      action_description: newDesc || undefined,
      priority: newPriority,
      deadline: newDeadline || undefined,
    });
    setCreating(false);
    if (!created) return;

    setNewTitle("");
    setNewDesc("");
    setNewPriority("medium");
    setNewDeadline("");
    setShowCreate(false);
  };

  const handleWebhookSubmit = async () => {
    if (!webhookModal || !webhookUrl.trim() || !evidenceReady) return;
    try {
      new URL(webhookUrl); // validate
    } catch {
      return;
    }
    setWebhookSending(true);
    await triggerWebhook(webhookModal.planId, webhookUrl.trim(), { decision_id: decisionId, decision_title: decisionTitle });
    setWebhookSending(false);
    setWebhookModal(null);
    setWebhookUrl("");
  };

  const handleSlackSubmit = async () => {
    if (!slackModal || !slackChannel.trim() || !evidenceReady) return;
    setSlackSending(true);
    const plan = plans.find(p => p.id === slackModal.planId);
    await notifySlack(
      slackModal.planId,
      slackChannel.trim(),
      `📋 *Execution Update*\nDecision: ${decisionTitle}\nAction: ${plan?.action_title || ""}\nStatus: ${plan?.status || "unknown"}`
    );
    setSlackSending(false);
    setSlackModal(null);
    setSlackChannel("");
  };

  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              Execution Plan
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate(!showCreate)}
              disabled={loading || !evidenceReady || !!error}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3 h-3" /> Add Action
            </Button>
          </div>
          {evidenceReady && plans.length > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <Progress value={completionRate * 100} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground font-medium">{Math.round(completionRate * 100)}%</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {error && !loading && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Execution evidence is unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quantivis could not verify the action timeline, execution receipts, or compensation state. It is withholding completion and empty-plan claims until the evidence service recovers.
                  </p>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {showCreate && evidenceReady && !error && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Action Title</Label>
                      <Input
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="e.g. Increase budget in ad platform"
                        maxLength={500}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description (optional)</Label>
                      <Textarea
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        rows={2}
                        placeholder="Describe what needs to happen..."
                        maxLength={2000}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Priority</Label>
                        <Select value={newPriority} onValueChange={setNewPriority}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Deadline</Label>
                        <Input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
                      </div>
                    </div>
                    <Button onClick={handleCreate} disabled={!newTitle.trim() || creating || !evidenceReady} size="sm" className="w-full gap-2">
                      {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create Action
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {evidenceReady && plans.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <ArrowRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No execution actions yet. Add actions to drive this decision forward.
            </div>
          )}

          {evidenceReady && (
            <div className="space-y-3">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onStatusChange={updatePlanStatus}
                  onWebhook={(id) => requireStepUp("webhook_trigger", "Trigger Webhook", () => setWebhookModal({ planId: id }))}
                  onSlack={(id) => requireStepUp("slack_send", "Send Slack Notification", () => setSlackModal({ planId: id }))}
                  canTriggerActions={canTriggerActions}
                />
              ))}
            </div>
          )}

          {evidenceReady && events.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/40">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Activity Log</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {events.slice(0, 10).map(evt => (
                  <div key={evt.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                    <span className="font-medium">{evt.event_type.replace(/_/g, " ")}</span>
                    <span className="ml-auto">{formatDistanceToNow(new Date(evt.created_at), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Modal */}
      <Dialog open={!!webhookModal} onOpenChange={(open) => { if (!open) { setWebhookModal(null); setWebhookUrl(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-primary" />
              Trigger Webhook
            </DialogTitle>
            <DialogDescription>
              Enter the HTTPS endpoint URL. Only approved domains are allowed. Internal/private addresses are blocked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Webhook URL (HTTPS only)</Label>
              <Input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/trigger"
                type="url"
              />
              {webhookUrl && !isValidUrl(webhookUrl) && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Must be a valid HTTPS URL
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWebhookModal(null); setWebhookUrl(""); }}>Cancel</Button>
            <Button
              onClick={handleWebhookSubmit}
              disabled={!isValidUrl(webhookUrl) || webhookSending || !evidenceReady}
              className="gap-2"
            >
              {webhookSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Webhook className="w-3 h-3" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slack Modal */}
      <Dialog open={!!slackModal} onOpenChange={(open) => { if (!open) { setSlackModal(null); setSlackChannel(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Notify Slack Channel
            </DialogTitle>
            <DialogDescription>
              Specify the channel to receive this execution update. Do not leave blank.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Input
                value={slackChannel}
                onChange={e => setSlackChannel(e.target.value)}
                placeholder="#strategy-decisions"
              />
              {slackChannel && !slackChannel.trim().startsWith("#") && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Channel names typically start with #
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSlackModal(null); setSlackChannel(""); }}>Cancel</Button>
            <Button
              onClick={handleSlackSubmit}
              disabled={!slackChannel.trim() || slackSending || !evidenceReady}
              className="gap-2"
            >
              {slackSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
              Send Notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step-Up Auth Dialog */}
      <StepUpAuthDialog
        open={!!pendingAction}
        action={pendingAction?.action ?? null}
        actionLabel={pendingAction?.label ?? ""}
        onVerify={verifyPassword}
        onVerified={onVerified}
        onCancel={cancelStepUp}
      />
    </>
  );
};

export default ExecutionTimeline;
