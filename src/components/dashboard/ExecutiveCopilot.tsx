import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Send, Loader2, Sparkles, RotateCcw, Activity, Database, Clock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { useRateLimitFeedback } from "@/hooks/useRateLimitFeedback";

interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  organizationId: string;
  roleType: string;
  riskScore?: number;
  tier: string | null;
  datasetId?: string;
  datasetName?: string | null;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/executive-copilot`;

const SUGGESTION_PROMPTS = [
  "What is our biggest strategic risk right now?",
  "Give me a board-ready risk assessment.",
  "What if revenue drops 15% next quarter?",
  "What immediate actions should I take this week?",
];

/** Derive risk badge styling from score using semantic tokens */
function getRiskBadge(score: number): { className: string; label: string } {
  if (score <= 25) return { className: "bg-success/10 text-success border-none", label: "Low" };
  if (score <= 50) return { className: "bg-primary/10 text-primary border-none", label: "Moderate" };
  if (score <= 75) return { className: "bg-warning/10 text-warning border-none", label: "Elevated" };
  return { className: "bg-destructive/10 text-destructive border-none", label: "High" };
}

const ExecutiveCopilot = ({ organizationId, roleType, riskScore, tier, datasetId, datasetName }: Props) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isThrottled, remainingCooldown, handleError: handleRateLimitError } = useRateLimitFeedback();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || isThrottled) return;
    setError(null);

    const userMsg: CopilotMessage = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Not authenticated");
      const token = auth.token;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text.trim(),
          session_id: sessionId,
          role_type: roleType,
          organization_id: organizationId,
          dataset_id: datasetId || null,
          dataset_name: datasetName || null,
        }),
      });

      const newSessionId = resp.headers.get("X-Session-Id");
      if (newSessionId) setSessionId(newSessionId);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const upsertAssistant = (nextChunk: string) => {
        assistantSoFar += nextChunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      const errorObj = e instanceof Error ? e : new Error(String(e));
      console.error("Copilot error:", errorObj);
      const wasRateLimited = handleRateLimitError(errorObj);
      if (!wasRateLimited) setError(errorObj.message);
      if (!assistantSoFar) {
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isThrottled, sessionId, roleType, organizationId, datasetId, datasetName, handleRateLimitError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetSession = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  };

  const riskBadge = riskScore !== undefined ? getRiskBadge(riskScore) : null;

  return (
    <div className="space-y-4">
      {/* Risk Summary Bar */}
      {riskScore !== undefined && riskBadge && (
        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <Activity className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Current Risk Index</p>
            <p className="text-2xl font-bold">{riskScore}<span className="text-sm text-muted-foreground font-normal">/100</span></p>
          </div>
          <Badge className={riskBadge.className}>
            {riskBadge.label}
          </Badge>
        </div>
      )}

      {/* Dataset Context Badge */}
      {datasetName && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/30 text-xs text-muted-foreground">
          <Database className="w-3.5 h-3.5" />
          <span>Grounded in: <strong className="text-foreground">{datasetName}</strong></span>
        </div>
      )}

      {/* Chat Card */}
      <Card className="flex flex-col" style={{ height: "calc(100vh - 420px)", minHeight: "400px" }}>
        <CardHeader className="pb-3 flex-none">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="w-5 h-5 text-primary" />
              Executive Intelligence Copilot
            </CardTitle>
            <div className="flex items-center gap-2">
              {sessionId && (
                <Button variant="ghost" size="sm" onClick={resetSession}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  New Session
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0 pb-4">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 gap-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">Ask Quantivis</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {datasetName
                      ? `Ask strategic questions grounded in "${datasetName}" — all answers reference your actual data.`
                      : "Select a dataset first for data-grounded intelligence. Without a dataset, responses will be limited to organizational signals only."
                    }
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {SUGGESTION_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="text-left p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm text-muted-foreground hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 border"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-muted/50 border rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Analyzing intelligence…</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {error && (
            <div className="flex-none mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          {isThrottled && (
            <div className="flex-none mt-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              Rate limit reached — please wait {remainingCooldown}s
            </div>
          )}

          <div className="flex-none mt-3 flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isThrottled ? `Rate limited — wait ${remainingCooldown}s…` : "Ask a strategic question…"}
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={isLoading || isThrottled}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || isThrottled}
              size="icon"
              aria-label="Send message"
              className="shrink-0 h-[44px] w-[44px]"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExecutiveCopilot;
