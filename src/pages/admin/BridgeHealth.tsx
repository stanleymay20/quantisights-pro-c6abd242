/**
 * /admin/bridge-health
 *
 * Operational dashboard for AICIS Bridge resilience layer:
 * - Per-surface: last cursor, page size used, consecutive failures,
 *   circuit-breaker status, next retry time.
 * - Read-only. Anyone in the org can view; no destructive actions.
 */

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  CircuitBoard,
  Clock,
  Loader2,
  RefreshCw,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";

interface SurfaceRow {
  surface: string;
  last_status: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  circuit_breaker_until: string | null;
  metadata: Record<string, any> | null;
}

export default function BridgeHealth() {
  const { currentOrg: organization } = useOrganization();
  const [rows, setRows] = useState<SurfaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("aicis_sync_surface_status")
      .select(
        "surface,last_status,last_attempt_at,last_success_at,last_error_message,consecutive_failures,circuit_breaker_until,metadata",
      )
      .eq("organization_id", organization.id)
      .order("surface");
    setRows((data ?? []) as SurfaceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const summary = useMemo(() => {
    const failureThreshold = 3;
    const open = rows.filter(
      (r) =>
        (r.circuit_breaker_until && Date.parse(r.circuit_breaker_until) > now) ||
        (r.consecutive_failures ?? 0) >= failureThreshold,
    ).length;
    const failing = rows.filter((r) => (r.consecutive_failures ?? 0) > 0).length;
    return { total: rows.length, open, failing };
  }, [rows, now]);

  if (!organization?.id) {
    return (
      <div className="p-6 text-muted-foreground">No organization context.</div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight flex items-center gap-2">
            <CircuitBoard className="h-6 w-6" /> AICIS Bridge Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resilience layer for AICIS ingestion — adaptive paging, resume
            cursor, and per-surface circuit breaker.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Tracked surfaces
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {summary.total}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Circuit breakers open
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            {summary.open}
            {summary.open > 0 && (
              <ShieldOff className="h-5 w-5 text-destructive" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Surfaces with failures
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            {summary.failing}
            {summary.failing > 0 && (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-surface status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Surface</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resume cursor</TableHead>
                  <TableHead>Page size</TableHead>
                  <TableHead>Consec. failures</TableHead>
                  <TableHead>Breaker</TableHead>
                  <TableHead>Next retry</TableHead>
                  <TableHead>Last attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No surface status recorded yet. Trigger a sync from /aicis-sync.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const timerActive =
                    !!r.circuit_breaker_until &&
                    Date.parse(r.circuit_breaker_until) > now;
                  // Show "open" if cooldown timer is still active OR the surface has
                  // burned through the failure threshold — a stale timer with 200+
                  // consecutive failures still means the breaker is tripped.
                  const failureThreshold = 3;
                  const breakerOpen = timerActive || (r.consecutive_failures ?? 0) >= failureThreshold;
                  const cursor = r.metadata?.resume_offset ?? 0;
                  const pageSize = r.metadata?.last_page_size ?? "—";
                  const paused = r.metadata?.paused === true;
                  const pausedReason = r.metadata?.paused_reason as string | undefined;
                  return (
                    <TableRow key={r.surface}>
                      <TableCell className="font-mono text-xs">
                        {r.surface}
                        {paused && pausedReason && (
                          <div className="text-[10px] font-sans text-amber-600 mt-0.5 max-w-xs whitespace-normal">
                            Paused: {pausedReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {paused ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">paused</Badge>
                        ) : r.last_status === "success" ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> success
                          </Badge>
                        ) : r.last_status === "skipped" ? (
                          <Badge variant="outline">skipped</Badge>
                        ) : r.last_status ? (
                          <Badge variant="destructive">{r.last_status}</Badge>
                        ) : (
                          <Badge variant="outline">never</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cursor}</TableCell>
                      <TableCell className="font-mono text-xs">{pageSize}</TableCell>
                      <TableCell>
                        <span className={r.consecutive_failures > 0 ? "text-amber-500 font-semibold" : ""}>
                          {r.consecutive_failures ?? 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        {breakerOpen ? (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldOff className="h-3 w-3" /> open
                          </Badge>
                        ) : (
                          <Badge variant="secondary">closed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {breakerOpen && r.circuit_breaker_until ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timerActive
                              ? `in ${formatDistanceToNow(new Date(r.circuit_breaker_until))}`
                              : "manual reset required"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_attempt_at
                          ? formatDistanceToNow(new Date(r.last_attempt_at), { addSuffix: true })
                          : "never"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
