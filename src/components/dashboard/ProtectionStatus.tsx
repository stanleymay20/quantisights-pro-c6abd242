import { useEffect, useState, memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldCheck, ShieldAlert, Activity, Brain, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSystemConfig } from "@/lib/system-config";

interface ProtectionStatusProps {
  organizationId: string;
  calibrationScore: number | null;
  pendingDecisions: number;
  criticalSignals: number;
}

type ProtectionLevel = "covered" | "watch" | "exposed";

interface Driver {
  label: string;
  value: string;
  status: "good" | "warning" | "critical";
  icon: typeof Shield;
}

const LEVEL_CONFIG: Record<ProtectionLevel, {
  label: string;
  description: string;
  icon: typeof Shield;
  containerClass: string;
  badgeClass: string;
  dotClass: string;
}> = {
  covered: {
    label: "Covered",
    description: "Decision governance is active. All signals addressed, calibration healthy.",
    icon: ShieldCheck,
    containerClass: "border-success/30 bg-success/[0.03]",
    badgeClass: "bg-success/10 text-success",
    dotClass: "bg-success",
  },
  watch: {
    label: "Watch",
    description: "Some governance gaps detected. Review pending items to maintain protection.",
    icon: Shield,
    containerClass: "border-warning/30 bg-warning/[0.03]",
    badgeClass: "bg-warning/10 text-warning",
    dotClass: "bg-warning",
  },
  exposed: {
    label: "Exposed",
    description: "Open signals detected. Review and resolve to improve governance posture.",
    icon: ShieldAlert,
    containerClass: "border-destructive/30 bg-destructive/[0.03]",
    badgeClass: "bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
  },
};

const STATUS_DOT: Record<string, string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

const ProtectionStatus = memo(({ organizationId, calibrationScore, pendingDecisions, criticalSignals }: ProtectionStatusProps) => {
  const [driftStatus, setDriftStatus] = useState<string>("stable");
  const [unclosedOutcomes, setUnclosedOutcomes] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    const fetchDrivers = async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [modelsRes, unclosedRes] = await Promise.all([
        supabase
          .from("calibration_models")
          .select("mean_absolute_error, overall_bias_direction")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(2),
        supabase
          .from("decision_ledger")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("execution_status", "not_started")
          .lt("created_at", thirtyDaysAgo.toISOString()),
      ]);

      const models = modelsRes.data;
      if (models && models.length >= 2) {
        const maeDelta = (models[0].mean_absolute_error ?? 0) - (models[1].mean_absolute_error ?? 0);
        const biasSame = models[0].overall_bias_direction === models[1].overall_bias_direction;
        if (maeDelta > 0.03 || !biasSame) setDriftStatus("degrading");
        else if (maeDelta > 0.01) setDriftStatus("watch");
        else setDriftStatus("stable");
      }

      setUnclosedOutcomes(unclosedRes.count ?? 0);
    };
    fetchDrivers();
  }, [organizationId]);

  const { calibrationGood, calibrationWarning } = getSystemConfig().confidenceDisplay;

  const level = useMemo((): ProtectionLevel => {
    let score = 0;
    if (criticalSignals > 0) score += 3;
    if (unclosedOutcomes > 2) score += 2;
    else if (unclosedOutcomes > 0) score += 1;
    if (driftStatus === "degrading") score += 2;
    else if (driftStatus === "watch") score += 1;
    if (calibrationScore != null && calibrationScore < calibrationWarning) score += 2;
    else if (calibrationScore != null && calibrationScore < calibrationGood) score += 1;
    if (pendingDecisions > 5) score += 1;

    if (score >= 4) return "exposed";
    if (score >= 2) return "watch";
    return "covered";
  }, [criticalSignals, unclosedOutcomes, driftStatus, calibrationScore, pendingDecisions]);

  const config = LEVEL_CONFIG[level];
  const LevelIcon = config.icon;

  const drivers: Driver[] = useMemo(() => [
    {
      label: "Calibration",
      value: calibrationScore != null ? `${calibrationScore}%` : "No data",
      status: calibrationScore == null ? "warning" : calibrationScore >= calibrationGood ? "good" : calibrationScore >= calibrationWarning ? "warning" : "critical",
      icon: Brain,
    },
    {
      label: "Model Drift",
      value: driftStatus === "stable" ? "Stable" : driftStatus === "watch" ? "Monitoring" : "Degrading",
      status: driftStatus === "stable" ? "good" : driftStatus === "watch" ? "warning" : "critical",
      icon: Activity,
    },
    {
      label: "Open Signals",
      value: `${criticalSignals}`,
      status: criticalSignals === 0 ? "good" : criticalSignals <= 2 ? "warning" : "critical",
      icon: AlertTriangle,
    },
    {
      label: "Unclosed Outcomes",
      value: `${unclosedOutcomes}`,
      status: unclosedOutcomes === 0 ? "good" : unclosedOutcomes <= 2 ? "warning" : "critical",
      icon: Clock,
    },
  ], [calibrationScore, driftStatus, criticalSignals, unclosedOutcomes]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${config.containerClass} p-4 md:p-5`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.badgeClass}`}>
            <LevelIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold">Governance Posture</h2>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.badgeClass} flex items-center gap-1.5`}>
                <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass} animate-pulse`} />
                {config.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 sm:line-clamp-none">{config.description}</p>
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-2 sm:grid sm:grid-cols-2 md:grid-cols-4 sm:gap-3 pb-1 sm:pb-0 scrollbar-hide">
        {drivers.map(driver => (
          <div
            key={driver.label}
            className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-lg bg-background/50 border border-border/20 shrink-0 min-w-[120px] sm:min-w-0"
          >
            <driver.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{driver.label}</p>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[driver.status]}`} />
                <p className="text-xs font-semibold">{driver.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
});

ProtectionStatus.displayName = "ProtectionStatus";

export default ProtectionStatus;
