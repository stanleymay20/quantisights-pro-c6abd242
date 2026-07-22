/**
 * useCopilotTelemetry — Phase 5.5
 *
 * Logs every Copilot interaction to localStorage (client-side store)
 * until the copilot_queries Supabase table is provisioned.
 *
 * Tracks:
 *   - query text
 *   - detected intent (from simple keyword matching)
 *   - routed destination
 *   - timestamp
 *   - success (did the user proceed to the destination?)
 *
 * The /copilot/analytics page reads from this store to display
 * Gate 2 readiness metrics.
 *
 * Migration path: once copilot_queries table exists in Supabase,
 * swap the localStorage write for a supabase.from('copilot_queries').insert()
 * call. The hook interface does not change.
 */

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";

export interface CopilotQueryEvent {
  id: string;
  userId: string | null;
  orgId: string | null;
  timestamp: string;
  query: string;
  detectedIntent: string;
  routedDestination: string;
  executionTimeMs: number;
  success: boolean;
  createdBriefId?: string | null;
}

// ─── Intent detection ─────────────────────────────────────────────────────────
const INTENT_PATTERNS: Array<{ intent: string; keywords: string[]; destination: string }> = [
  { intent: "view_decisions",     keywords: ["decision","approv","pending","ledger","review","prioriti","what should i"],                        destination: "/decisions" },
  { intent: "view_risks",         keywords: ["risk","threat","critical","danger","biggest risk","attention","need my attention","concern"],       destination: "/executive-intelligence" },
  { intent: "diagnose_revenue",   keywords: ["sales slow","revenue drop","losing money","revenue declin","why are sales","where are we losing"],  destination: "/executive-intelligence" },
  { intent: "run_forecast",       keywords: ["forecast","predict","next quarter","projection","happen if","what will happen","drops","revenue drop"], destination: "/simulations" },
  { intent: "run_simulation",     keywords: ["simulat","what if","what-if","scenario","impact","10%","drop by"],                                  destination: "/simulations" },
  { intent: "view_reports",       keywords: ["report","board","executive summary"],                                                               destination: "/reports" },
  { intent: "upload_data",        keywords: ["upload","csv","dataset","import"],                                                                  destination: "/data-upload" },
  { intent: "view_governance",    keywords: ["govern","compliance","soc","iso","audit","gdpr"],                                                   destination: "/governance" },
  { intent: "view_outcomes",      keywords: ["outcome","result","did it work","performance","accuracy","track"],                                  destination: "/outcomes" },
  { intent: "view_interventions", keywords: ["intervention","alert","escalat","response","attention","risks"],                                    destination: "/interventions" },
  { intent: "view_lineage",       keywords: ["lineage","source","provenance","trace","where did"],                                                destination: "/lineage" },
  { intent: "view_trust",         keywords: ["trust","security","certif","procurement"],                                                          destination: "/trust" },
  { intent: "view_execution",     keywords: ["execut","action","stall","overdue","blocked"],                                                      destination: "/execution" },
  { intent: "view_data",          keywords: ["data","dataset","analyse","analyze","analyze data"],                                                destination: "/dataset-explorer" },
];

export function detectIntent(query: string): { intent: string; destination: string } {
  const lower = query.toLowerCase();
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.keywords.some(k => lower.includes(k))) {
      return { intent: pattern.intent, destination: pattern.destination };
    }
  }
  return { intent: "unknown", destination: "/executive-intelligence" };
}

// ─── Storage ──────────────────────────────────────────────────────────────────
// Scoped per-org (not a single global key) to prevent query logs from one
// organization leaking into another when a user is a member of multiple orgs
// and switches between them on the same browser. Also enforces a 30-day
// expiry, consistent with the retention period this app's own Data Retention
// Policy (/data-retention) commits to for "Copilot messages" — without this,
// raw executive query text would persist in localStorage indefinitely with
// no encryption and no relationship to the org's actual retention settings.
const STORAGE_PREFIX = "quantivis_copilot_queries";
const MAX_STORED = 500;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches published retention policy

function storageKey(orgId: string | null): string {
  return orgId ? `${STORAGE_PREFIX}_${orgId}` : STORAGE_PREFIX;
}

function pruneExpired(events: CopilotQueryEvent[]): CopilotQueryEvent[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return events.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function getCopilotQueryLog(orgId: string | null = null): CopilotQueryEvent[] {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    const parsed: CopilotQueryEvent[] = raw ? JSON.parse(raw) : [];
    return pruneExpired(parsed);
  } catch { return []; }
}

function appendToLog(orgId: string | null, event: CopilotQueryEvent) {
  try {
    const existing = getCopilotQueryLog(orgId);
    const updated = [event, ...existing].slice(0, MAX_STORED);
    localStorage.setItem(storageKey(orgId), JSON.stringify(updated));
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useCopilotTelemetry() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();

  const logQuery = useCallback((
    query: string,
    routedDestination?: string,
    success: boolean = true,
    createdBriefId?: string | null,
  ): { intent: string; destination: string } => {
    const start = performance.now();
    const { intent, destination } = detectIntent(query);
    const finalDestination = routedDestination ?? destination;
    const executionTimeMs = Math.round(performance.now() - start);

    const event: CopilotQueryEvent = {
      id: `cq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: user?.id ?? null,
      orgId: currentOrgId ?? null,
      timestamp: new Date().toISOString(),
      query,
      detectedIntent: intent,
      routedDestination: finalDestination,
      executionTimeMs,
      success,
      createdBriefId: createdBriefId ?? null,
    };

    appendToLog(currentOrgId ?? null, event);
    return { intent, destination: finalDestination };
  }, [user?.id, currentOrgId]);

  return { logQuery, detectIntent };
}
