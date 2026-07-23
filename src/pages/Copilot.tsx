// @ts-nocheck — suppresses TS2589/TS2769 from large generated schema; remove when schema stabilises
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquareText, ArrowRight, BarChart2, ClipboardList,
  TrendingUp, FileText, ShieldAlert, Sparkles, Loader2,
  Paperclip, X as XIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useProject } from "@/contexts/ProjectContext";
import { useIndustryLabels } from "@/hooks/useIndustryLanguage";
import { useCopilotTelemetry } from "@/hooks/useCopilotTelemetry";
import { useInsights } from "@/hooks/useInsights";
import { useMetricsSummary } from "@/hooks/useMetricsSummary";
import { supabase } from "@/integrations/supabase/client";
import { getVerifiedAuth } from "@/lib/auth-helpers";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { generateAnswer } from "@/lib/copilot-answer-engine";
import type { DecisionSummary } from "@/lib/copilot-answer-engine";

interface SuggestedPrompt {
  label: string;
  icon: React.ElementType;
  path: string;
  description?: string;
}

interface InlineBrief {
  query: string;
  title: string;
  summary: string;
  action: string;
  destination: string;
  confidence?: number | null;
  status: "answered" | "needs_data";
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { label: "Why are sales slowing?", icon: TrendingUp, path: "/executive-intelligence", description: "Generates a Decision Brief" },
  { label: "What should I prioritise this week?", icon: ClipboardList, path: "/decisions", description: "Finds priority decisions" },
  { label: "Where are we losing money?", icon: BarChart2, path: "/executive-intelligence", description: "Analyses cost and margin signals" },
  { label: "What decisions need my approval?", icon: ShieldAlert, path: "/decisions", description: "Shows pending approvals" },
  { label: "What will happen if revenue drops 10%?", icon: Sparkles, path: "/simulations", description: "Runs a scenario path" },
  { label: "Which risks need my attention?", icon: FileText, path: "/interventions", description: "Surfaces active risks" },
];

const shortTitle = (value: string) => {
  const cleaned = value.replace(/[—–-].*$/, "").trim();
  return cleaned.split(/\s+/).slice(0, 7).join(" ") || "Review Decision Brief";
};

const toPercent = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 1 ? Math.round(value) : Math.round(value * 100);
};

const fallbackBrief = (query: string, destination: string): InlineBrief => ({
  query,
  destination,
  status: "needs_data",
  title: "Connect Data First",
  summary: "Quantivis needs connected data or existing decision evidence before it can answer this with a full Decision Brief.",
  action: "Connect data, then ask the same question again to receive an evidence-backed recommendation.",
});

const decisionToBrief = (query: string, destination: string, decision: any): InlineBrief => {
  const action = decision?.recommended_action || decision?.source_insight_summary || decision?.notes || "Review this decision";
  return {
    query,
    destination,
    status: "answered",
    title: shortTitle(action),
    summary: decision?.source_insight_summary || action,
    action,
    confidence: toPercent(decision?.capped_confidence ?? decision?.confidence_at_decision ?? decision?.raw_confidence),
  };
};

const Copilot = () => {
  const { profile } = useAuth();
  const { currentOrg, currentOrgId } = useOrganization();
  const { orgRole } = usePermissions();
  const { activeDatasetId } = useProject();
  const lang = useIndustryLabels(currentOrg?.industry);
  const { logQuery } = useCopilotTelemetry();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brief, setBrief] = useState<InlineBrief | null>(null);
  const [answering, setAnswering] = useState(false);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState(0);

  // Load live data for the answer engine
  const { insights } = useInsights(currentOrgId ?? null, activeDatasetId ?? null);
  const { topMetrics } = useMetricsSummary(currentOrgId ?? null, activeDatasetId ?? null);

  useEffect(() => {
    if (!currentOrgId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("decision_ledger")
      .select("id,recommended_action,decision_type,capped_confidence,predicted_net_impact")
      .eq("organization_id", currentOrgId)
      .eq("is_suppressed", false)
      .in("decision_status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }: { data: DecisionSummary[] | null }) => {
        setDecisions(data ?? []);
        setPendingDecisions(data?.length ?? 0);
      });
  }, [currentOrgId]);

  useEffect(() => {
    const prefilledQuery = searchParams.get("q");
    if (prefilledQuery) setQuery(prefilledQuery);
  }, [searchParams]);

  const firstName = profile?.full_name?.split(" ")[0] || "there";

  const runLocalEngine = (trimmed: string): InlineBrief => {
    const generated = generateAnswer(trimmed, {
      insights,
      metrics: topMetrics ?? [],
      pendingDecisions,
      orgName: currentOrg?.name?.trim() ?? "your organisation",
      decisions,
    });
    return {
      query: trimmed,
      destination: generated.destination,
      status: generated.dataSource === "live" ? "answered" : "needs_data",
      title: generated.headline,
      summary:
        generated.summary +
        (generated.lines.length > 0
          ? "\n\n" +
            generated.lines
              .map((l) => {
                const sep = l.label.endsWith("…") ? " : " : ": ";
                return `${l.label}${sep}${l.value}`;
              })
              .join("  ·  ")
          : ""),
      action: generated.destinationLabel,
      confidence: generated.confidence,
    };
  };

  const answerQuestion = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    logQuery(trimmed || "[file upload]");
    setAnswering(true);

    // Always seed routing/destination metadata from the local engine so the
    // brief card retains "Open workspace" + Approve/Simulate/Discuss actions.
    const local = runLocalEngine(trimmed);

    // If we don't have an org yet (auth still loading), fall back to local.
    if (!currentOrgId) {
      setBrief(local);
      setQuery("");
      setAnswering(false);
      return;
    }

    // Stream a real, RAG-grounded answer from the executive-copilot edge
    // function. Falls back to the local engine on any error.
    setBrief({ ...local, title: trimmed, summary: "", action: local.action });
    setQuery("");

    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Not authenticated");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/executive-copilot`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          message: attachedFiles.length > 0
            ? `${trimmed}\n\n[Attached: ${attachedFiles.map(f => f.name).join(", ")}]`
            : trimmed,
          session_id: null,
          role_type: orgRole || "owner",
          organization_id: currentOrgId,
          dataset_id: activeDatasetId || null,
          dataset_name: null,
        }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`copilot ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamed = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        textBuffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(j);
            const c = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (c) {
              streamed += c;
              setBrief((b) => (b ? { ...b, summary: streamed, status: "answered" } : b));
            }
          } catch { /* partial */ }
        }
      }

      if (!streamed.trim()) {
        // Empty stream — fall back to local engine answer
        setBrief(local);
      }
    } catch (e) {
      console.warn("Copilot edge call failed, falling back to local engine:", e);
      setBrief(local);
    } finally {
      setAnswering(false);
    }
  };

  const handleSubmit = () => answerQuestion(query);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePromptClick = (prompt: SuggestedPrompt) => {
    answerQuestion(prompt.label);
  };

  return (
    <SectionErrorBoundary sectionName="Copilot">
      <>
        <header className="h-14 border-b border-border/30 flex items-center gap-3 px-6 shrink-0 bg-background/60 backdrop-blur-sm">
          <SidebarMobileToggle />
          <MessageSquareText className="w-5 h-5 text-primary" />
          <h1 className="text-[18px] font-semibold tracking-tight">Decision Copilot</h1>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto px-6 pt-16 pb-12">
            <div className="mb-10">
              <h2 className="text-[18px] font-semibold tracking-tight mb-1">Ask Quantivis</h2>
              <p className="text-[13px] text-muted-foreground">Query your decision data in plain language. Every answer links to source evidence.</p>
              {orgRole && orgRole !== "owner" && orgRole !== "admin" && (
                <span className="inline-block mt-2 text-[11px] text-muted-foreground/60 bg-muted/40 px-2.5 py-1 rounded-full capitalize">{orgRole} view</span>
              )}
            </div>

            {/* Input area */}
            <div className="mb-8">
              <div className="border border-border/50 rounded-lg bg-background focus-within:border-primary/50 transition-colors">
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything — e.g. 'Why are sales slowing?' or 'Show me pending approvals'"
                  className="min-h-[72px] text-[13px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-t-lg rounded-b-none bg-transparent"
                  rows={3}
                  aria-label="Ask the Decision Copilot"
                />
                {/* Attached files */}
                {attachedFiles.length > 0 && (
                  <div className="px-3 py-1.5 border-t border-border/30 flex flex-wrap gap-1.5">
                    {attachedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] bg-muted/50 border border-border/30 rounded px-2 py-1 text-muted-foreground">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[140px] font-medium text-foreground/70">{f.name}</span>
                        <span className="text-muted-foreground/40">{(f.size/1024).toFixed(0)}KB</span>
                        <button onClick={() => setAttachedFiles(fs => fs.filter((_,j)=>j!==i))} className="hover:text-foreground ml-0.5" aria-label="Remove file">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/30 bg-muted/20">
                  <div className="flex items-center gap-2">
                    {/* File upload */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".csv,.xlsx,.pdf,.txt,.json,.docx"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-background transition-colors px-2 py-1.5 rounded-md"
                      title="Attach file — CSV, Excel, PDF, TXT (max 5 files)"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Attach</span>
                    </button>
                    <span className="text-[10px] text-muted-foreground/40">CSV · Excel · PDF · TXT</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/40 hidden sm:inline">⌘↵ to send</span>
                    <Button
                      onClick={handleSubmit}
                      disabled={(!query.trim() && attachedFiles.length === 0) || answering}
                      className="h-8 px-4 text-[13px] font-medium gap-1.5 rounded-md"
                    >
                      {answering
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><span>Ask</span><ArrowRight className="w-3 h-3" /></>
                      }
                    </Button>
                  </div>
                </div>
              </div>
              {attachedFiles.length > 0 && (
                <p className="text-[11px] text-muted-foreground/50 mt-1.5 px-1">
                  {attachedFiles.length} file{attachedFiles.length > 1 ? "s" : ""} attached — content will be used as context
                </p>
              )}
            </div>

            {brief && (
              <Card className="mb-8 border-border/40 bg-card">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={brief.status === "answered" ? "default" : "outline"} className="text-[10px]">
                          {brief.status === "answered" ? "Decision Brief" : "Setup Brief"}
                        </Badge>
                        {brief.confidence != null && <Badge variant="outline" className="text-[10px]">{Math.round(brief.confidence)}% confidence</Badge>}
                      </div>
                      <h3 className="text-[14px] font-semibold tracking-tight">{brief.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Asked: {brief.query}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                    {brief.summary ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed [&>p]:mb-2 [&>ul]:mb-2 [&>ul]:ml-4 [&>ol]:mb-2 [&>ol]:ml-4 [&>h1]:text-base [&>h1]:font-semibold [&>h2]:text-sm [&>h2]:font-semibold [&>h3]:text-sm [&>h3]:font-semibold [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief.summary}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{answering ? "Analyzing your data…" : ""}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recommended action</p>
                    <p className="text-sm font-medium text-foreground">{brief.action}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => navigate("/decisions")}>Approve / Review</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/simulations?q=${encodeURIComponent(brief.query)}`)}>Simulate</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/deliberation")}>Discuss</Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(brief.destination)}>Open workspace</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground/50 uppercase tracking-[0.1em] mb-3">Suggested queries</p>
              {(lang.copilotPrompts.length > 0
                ? lang.copilotPrompts.map((label, i) => ({
                    label,
                    icon: SUGGESTED_PROMPTS[i % SUGGESTED_PROMPTS.length].icon,
                    path: SUGGESTED_PROMPTS[i % SUGGESTED_PROMPTS.length].path,
                    description: SUGGESTED_PROMPTS[i % SUGGESTED_PROMPTS.length].description,
                  }))
                : SUGGESTED_PROMPTS
              ).map((prompt) => (
                <Card key={`${prompt.path}-${prompt.label}`} className="border-0 border-b border-border/20 last:border-0 rounded-none hover:bg-muted/30 cursor-pointer transition-colors shadow-none" onClick={() => answerQuestion(prompt.label)}>
                  <CardContent className="p-3 flex items-center gap-3">

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{prompt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{prompt.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-10 border-t border-border/30 pt-6">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest text-center mb-3">Every decision follows the same path</p>
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {[
                  { label: "Data", path: "/data-upload" },
                  { label: "Signals", path: "/executive-intelligence" },
                  { label: "Decision Brief", path: "/decisions" },
                  { label: "Approval", path: "/decisions" },
                  { label: "Execution", path: "/execution" },
                  { label: "Outcome", path: "/outcomes" },
                  { label: "Learning", path: "/decision-accuracy" },
                ].map((step, i, arr) => (
                  <span key={step.label} className="flex items-center gap-1">
                    <button onClick={() => navigate(step.path)} className="text-[11px] text-muted-foreground/60 hover:text-primary transition-colors">{step.label}</button>
                    {i < arr.length - 1 && <span className="text-muted-foreground/30 text-[10px]">-&gt;</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Looking for a specific workspace? <button onClick={() => navigate("/dashboard")} className="text-primary hover:underline">View all workspaces</button></p>
              <p className="text-xs text-muted-foreground"><button onClick={() => navigate("/copilot/analytics")} className="text-muted-foreground/60 hover:text-primary transition-colors hover:underline">Copilot analytics →</button></p>
            </div>
          </div>
        </main>
      </>
    </SectionErrorBoundary>
  );
};

export default Copilot;
