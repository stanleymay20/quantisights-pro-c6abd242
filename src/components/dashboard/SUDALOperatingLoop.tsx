/**
 * SUDAL Operating Loop — Visual tracker for the 5-phase decision cycle
 * Sense → Understand → Decide → Act → Learn
 */
import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar, Brain, Gavel, Zap, GraduationCap,
  ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSUDALHealth, type PhaseHealth } from "@/hooks/useSUDALHealth";

interface SUDALOperatingLoopProps {
  organizationId: string;
}

const PHASE_ICONS = {
  sense: Radar,
  understand: Brain,
  decide: Gavel,
  act: Zap,
  learn: GraduationCap,
} as const;

const PHASE_COLORS = {
  strong: "text-emerald-500",
  operational: "text-primary",
  developing: "text-amber-500",
  inactive: "text-muted-foreground",
} as const;

const STATUS_BG = {
  strong: "bg-emerald-500/10 border-emerald-500/30",
  operational: "bg-primary/10 border-primary/30",
  developing: "bg-amber-500/10 border-amber-500/30",
  inactive: "bg-muted/30 border-border/30",
} as const;

const PhaseCard = memo(({ phase }: { phase: PhaseHealth }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = PHASE_ICONS[phase.id];
  const color = PHASE_COLORS[phase.status];
  const bg = STATUS_BG[phase.status];

  return (
    <motion.div
      layout
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${bg}`}
      onClick={() => setExpanded(!expanded)}
      whileHover={{ scale: 1.01 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-sm font-semibold">{phase.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] capitalize ${color}`}
          >
            {phase.score}%
          </Badge>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </div>

      <Progress value={phase.score} className="h-1 mt-2" />

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-1.5 overflow-hidden"
          >
            {phase.signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {s.met ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                  )}
                  <span className={s.met ? "text-foreground" : "text-muted-foreground"}>
                    {s.label}
                  </span>
                </div>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {s.value}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
PhaseCard.displayName = "PhaseCard";

const SUDALOperatingLoop = memo(({ organizationId }: SUDALOperatingLoopProps) => {
  const { phases, overallScore, closedLoopRate, loading } = useSUDALHealth(organizationId);

  if (loading && phases.length === 0) {
    return (
      <Card className="border-border/30">
        <CardContent className="p-4">
          <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
        </CardContent>
      </Card>
    );
  }

  const overallColor = overallScore >= 80
    ? "text-emerald-500"
    : overallScore >= 50
      ? "text-primary"
      : overallScore >= 20
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <Card className="border-border/30">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-sm font-semibold">Operating Loop</h3>
              <p className="text-[10px] text-muted-foreground">
                Sense → Understand → Decide → Act → Learn
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${overallColor}`}>{overallScore}%</span>
            <p className="text-[10px] text-muted-foreground">
              Loop: {closedLoopRate}% closed
            </p>
          </div>
        </div>

        {/* Phase flow indicator */}
        <div className="flex items-center justify-between gap-1">
          {phases.map((phase, i) => {
            const Icon = PHASE_ICONS[phase.id];
            const color = PHASE_COLORS[phase.status];
            return (
              <div key={phase.id} className="flex items-center gap-1">
                <div className={`flex items-center gap-0.5 ${color}`}>
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-medium hidden sm:inline">
                    {phase.label}
                  </span>
                </div>
                {i < phases.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </div>

        {/* Phase cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {phases.map(phase => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

SUDALOperatingLoop.displayName = "SUDALOperatingLoop";

export default SUDALOperatingLoop;
