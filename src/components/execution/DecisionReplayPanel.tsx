import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, TrendingUp, TrendingDown, Minus, Loader2,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useDecisionReplay, type DecisionReplay } from "@/hooks/useDecisionReplay";
import { formatDistanceToNow } from "date-fns";

interface DecisionReplayPanelProps {
  organizationId: string;
  decisionId: string;
  decisionTitle: string;
}

const DriftIndicator = ({ drift }: { drift: number | null }) => {
  if (drift == null) return <AlertTriangle className="w-4 h-4 text-warning" />;
  if (Math.abs(drift) < 3) return <Minus className="w-4 h-4 text-muted-foreground" />;
  if (drift > 0) return <TrendingUp className="w-4 h-4 text-success" />;
  return <TrendingDown className="w-4 h-4 text-destructive" />;
};

const confidenceLabel = (value: number | null) => value == null ? "Unknown" : `${value.toFixed(0)}%`;

const ReplayCard = ({ replay }: { replay: DecisionReplay }) => {
  const drift = replay.confidence_drift;
  const driftAbs = drift == null ? null : Math.abs(drift);
  const driftColor = drift == null
    ? "text-warning"
    : driftAbs! < 5
      ? "text-muted-foreground"
      : drift > 0
        ? "text-success"
        : "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Card className={`${replay.recommendation_changed ? "border-warning/40 bg-warning/5" : ""}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <DriftIndicator drift={drift} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {confidenceLabel(replay.original_confidence)}
                    <span className="text-muted-foreground mx-1">→</span>
                    {confidenceLabel(replay.replayed_confidence)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${driftColor}`}
                  >
                    {drift == null ? "Drift unknown" : `${drift > 0 ? "+" : ""}${drift.toFixed(1)}pp`}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(replay.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            {replay.recommendation_changed ? (
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 gap-1">
                <AlertTriangle className="w-3 h-3" /> Changed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Consistent
              </Badge>
            )}
          </div>

          {(replay.original_confidence == null || replay.replayed_confidence == null || replay.confidence_drift == null) && (
            <p className="text-[11px] text-warning">
              Confidence comparison is incomplete; Quantivis is not substituting missing confidence with zero.
            </p>
          )}

          {replay.replay_narrative && (
            <p className="text-xs text-muted-foreground leading-relaxed">{replay.replay_narrative}</p>
          )}

          {replay.recommendation_changed && replay.replayed_recommendation && (
            <div className="p-2 rounded-md bg-warning/5 border border-warning/20">
              <p className="text-xs font-medium text-warning">Revised Recommendation</p>
              <p className="text-xs text-foreground mt-1">{replay.replayed_recommendation}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

const DecisionReplayPanel = ({ organizationId, decisionId, decisionTitle }: DecisionReplayPanelProps) => {
  const { runReplay, replaying, replays, fetchReplays, error } = useDecisionReplay(organizationId);
  const [localReplays, setLocalReplays] = useState<DecisionReplay[]>([]);

  useEffect(() => {
    void fetchReplays(decisionId);
  }, [decisionId, fetchReplays]);

  useEffect(() => {
    setLocalReplays(replays);
  }, [replays]);

  const handleReplay = async () => {
    const result = await runReplay(decisionId);
    if (result) {
      setLocalReplays(prev => [result, ...prev]);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" />
            Decision Replay™
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReplay}
            disabled={replaying}
            className="gap-1.5 text-xs"
          >
            {replaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Replay Now
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Re-evaluate this decision with current data and calibration to see if the recommendation still holds.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 w-4 h-4 text-destructive" />
              <div>
                <p className="text-xs font-semibold">Replay evidence is unavailable</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{error}</p>
              </div>
            </div>
          </div>
        )}

        {localReplays.length === 0 && !replaying && !error && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No replays yet. Run a replay to see how this decision holds up with today's data.
          </div>
        )}

        {replaying && localReplays.length === 0 && (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing with current data...
          </div>
        )}

        <AnimatePresence>
          {localReplays.map(replay => (
            <ReplayCard key={replay.id} replay={replay} />
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};

export default DecisionReplayPanel;
