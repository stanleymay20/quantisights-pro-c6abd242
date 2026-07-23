import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert } from "lucide-react";

interface EmbedConfig {
  organization_id: string;
  dashboard_type: string;
  allowed_metrics: string[];
}

const EmbedDashboard = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Missing embed token");
      setLoading(false);
      return;
    }

    const load = async () => {
      // Validate token
      const { data: tokenData, error: tokenErr } = await supabase
        .from("embed_tokens")
        .select("organization_id, dashboard_type, allowed_metrics, is_active, expires_at")
        .eq("token", token)
        .eq("is_active", true)
        .single();

      if (tokenErr || !tokenData) {
        setError("Invalid or expired embed token");
        setLoading(false);
        return;
      }

      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        setError("Embed token has expired");
        setLoading(false);
        return;
      }

      setConfig({
        organization_id: tokenData.organization_id,
        dashboard_type: tokenData.dashboard_type,
        allowed_metrics: (tokenData.allowed_metrics as string[]) || [],
      });

      // Fetch latest metrics for the org
      const { data: metricData } = await supabase
        .from("metric_latest")
        .select("*")
        .eq("organization_id", tokenData.organization_id)
        .limit(50);

      setMetrics(metricData ?? []);
      setLoading(false);
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0F172A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-[#0F172A] flex items-center justify-center text-center p-8">
        <div>
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-[16px] font-semibold tracking-tight text-white mb-2">Access Denied</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0F172A] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-white">
            {config?.dashboard_type === "kpi_overview" ? "KPI Overview" : config?.dashboard_type}
          </h1>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Powered by Quantivis
          </span>
        </div>

        {metrics.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No metrics data available for this dashboard.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map((m: any, i: number) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card/50 p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {m.metric_name}
                </p>
                <p className="text-2xl font-bold text-white">
                  {typeof m.latest_value === "number" ? m.latest_value.toLocaleString() : m.latest_value}
                </p>
                {m.change_pct != null && (
                  <p className={`text-xs mt-1 ${m.change_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {m.change_pct >= 0 ? "▲" : "▼"} {Math.abs(m.change_pct).toFixed(1)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-[10px] text-muted-foreground/50">
          Real-time embedded dashboard · Data refreshes automatically
        </div>
      </div>
    </div>
  );
};

export default EmbedDashboard;
