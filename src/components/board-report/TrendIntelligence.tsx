import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ConvergencePoint {
  score: number;
  created_at: string;
}

interface RoleRisk {
  role_type: string;
  score: number;
  components: { deviation: number; trend: number; volatility: number; forecast: number };
  last_updated: string;
  escalation_required: boolean;
}

interface EciTrend {
  direction: "up" | "down" | "stable";
  percentChange: number;
  dataPoints: number;
}

interface TrendIntelligenceProps {
  eciTrend: EciTrend | null;
  convergenceHistory: ConvergencePoint[];
  roleRisks: RoleRisk[];
}

/** Data-driven score → semantic color class */
function getScoreColorClass(score: number): string {
  if (score <= 25) return "text-success bg-success";
  if (score <= 50) return "text-primary bg-primary";
  if (score <= 75) return "text-warning bg-warning";
  return "text-destructive bg-destructive";
}

/** Trend direction → semantic color */
function getTrendColorClass(direction: string): string {
  if (direction === "down") return "text-success"; // risk decreasing = good
  if (direction === "up") return "text-destructive"; // risk increasing = bad
  return "text-muted-foreground";
}

const TrendIntelligence = ({ eciTrend, convergenceHistory, roleRisks }: TrendIntelligenceProps) => {
  const TrendIcon = eciTrend?.direction === "up" ? TrendingUp : eciTrend?.direction === "down" ? TrendingDown : Minus;
  const trendColorClass = eciTrend ? getTrendColorClass(eciTrend.direction) : "text-muted-foreground";

  const maxScore = convergenceHistory.length > 0 ? Math.max(...convergenceHistory.map((p) => p.score), 100) : 100;

  return (
    <div className="px-16 py-12 border-b border-border/50 print:border-border">
      <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
        Trend Intelligence — 30 Day Window
      </h2>

      {/* ECI Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="border border-border/50 print:border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            ECI Movement
          </h3>
          {eciTrend ? (
            <div className="flex items-center gap-6">
              <TrendIcon className={`w-12 h-12 ${trendColorClass}`} />
              <div>
                <div className={`text-3xl font-bold ${trendColorClass}`}>
                  {eciTrend.percentChange > 0 ? "+" : ""}
                  {Math.round(eciTrend.percentChange)}%
                </div>
                <div className="text-sm text-muted-foreground">
                  {eciTrend.direction === "up"
                    ? "Risk increasing"
                    : eciTrend.direction === "down"
                    ? "Risk decreasing"
                    : "Stable"}{" "}
                  · {eciTrend.dataPoints} data points
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground italic">Insufficient historical trend data</p>
          )}
        </div>

        {/* Sparkline */}
        <div className="border border-border/50 print:border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            ECI History
          </h3>
          {convergenceHistory.length >= 2 ? (
            <div className="flex items-end gap-1 h-16">
              {convergenceHistory.map((p, i) => {
                const height = Math.max((p.score / maxScore) * 100, 5);
                const colors = getScoreColorClass(p.score);
                const bgClass = colors.split(" ")[1];
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${bgClass}`}
                    style={{
                      height: `${height}%`,
                      opacity: 0.5 + (i / convergenceHistory.length) * 0.5,
                    }}
                    title={`${p.score} — ${new Date(p.created_at).toLocaleDateString()}`}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground italic">Insufficient historical trend data</p>
          )}
        </div>
      </div>

      {/* Role Risk Movement */}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Role Risk Movement
      </h3>
      {roleRisks.length === 0 ? (
        <p className="text-muted-foreground italic">No role risk indices computed yet.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {roleRisks.map((role) => {
            const colors = getScoreColorClass(role.score);
            const textClass = colors.split(" ")[0];
            const bgClass = colors.split(" ")[1];
            return (
              <div
                key={role.role_type}
                className="border border-border/50 print:border-border rounded-xl p-5"
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                  {role.role_type}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className={`text-3xl font-bold ${textClass}`}>
                    {role.score}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted/50 print:bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${bgClass}`}
                    style={{ width: `${role.score}%` }}
                  />
                </div>
                {role.escalation_required && (
                  <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive print:bg-destructive/10 font-semibold">
                    ESCALATION
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrendIntelligence;
