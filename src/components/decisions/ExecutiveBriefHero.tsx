import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileSearch, Gauge, ShieldAlert, Sparkles, Timer, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEMO_DECISION_ID,
  formatEuro,
  formatPercent,
  getEstimatedExecutionTimeline,
  getEvidenceSignalCount,
  getExecutiveNarrative,
  getExecutiveRiskLevel,
  type ReviewableDecision,
} from "@/components/decisions/executive-review-flow";

const RISK_STYLES: Record<string, string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  High: "border-destructive/30 bg-destructive/10 text-destructive",
};

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold sm:text-base">{value}</p>
    </div>
  );
}

export interface ExecutiveBriefHeroProps {
  decision: ReviewableDecision;
  isDemo?: boolean;
}

/**
 * UX-2 Executive Brief hero: one recommended decision a COO/CIO can
 * understand in 30 seconds, with a single primary CTA into the review flow.
 */
export function ExecutiveBriefHero({ decision, isDemo = false }: ExecutiveBriefHeroProps) {
  const navigate = useNavigate();
  const risk = getExecutiveRiskLevel(decision);
  const confidence =
    decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence;
  const evidenceCount = getEvidenceSignalCount(decision);

  return (
    <Card
      className="border-primary/20 bg-primary/[0.02]"
      data-testid="executive-brief-hero"
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Recommended decision
          </Badge>
          {isDemo && (
            <Badge
              variant="outline"
              className="w-fit border-warning/40 bg-warning/10 text-[10px] uppercase tracking-wide text-warning"
              data-testid="demo-decision-badge"
            >
              Demo — sample data
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl leading-snug sm:text-2xl">
          {decision.recommended_action}
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {getExecutiveNarrative(decision)}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <HeroStat
            icon={TrendingUp}
            label="Expected impact"
            value={formatEuro(decision.predicted_net_impact)}
          />
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-primary" />
              Risk level
            </p>
            <Badge variant="outline" className={cn("mt-1", RISK_STYLES[risk])}>
              {risk}
            </Badge>
          </div>
          <HeroStat icon={Gauge} label="Confidence" value={formatPercent(confidence)} />
          <HeroStat
            icon={FileSearch}
            label="Evidence"
            value={
              evidenceCount > 0
                ? `${evidenceCount} linked signal${evidenceCount === 1 ? "" : "s"}`
                : "Not yet linked"
            }
          />
          <HeroStat
            icon={Timer}
            label="Estimated execution"
            value={getEstimatedExecutionTimeline(decision)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 px-5 font-semibold"
            onClick={() => navigate(`/decisions/${decision.id}/review`)}
            data-testid="review-decision-cta"
          >
            Review Decision
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-10" asChild>
            <Link to="/decisions">View Decision Ledger</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Shown when no live decision needs review. Offers a clearly-labelled demo
 * walkthrough instead of fabricating data.
 */
export function ExecutiveBriefEmptyState() {
  const navigate = useNavigate();
  return (
    <Card data-testid="executive-brief-empty-state">
      <CardHeader className="space-y-2">
        <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
          Executive Brief
        </Badge>
        <CardTitle className="text-xl">No decision requires your review right now</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          I analyzed available signals, evidence, risks, and projected impact. No pending
          recommendation currently meets the executive review threshold. New decisions appear here
          the moment they need your judgment.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => navigate(`/decisions/${DEMO_DECISION_ID}/review`)}
          data-testid="demo-review-cta"
        >
          <Sparkles className="h-4 w-4" />
          Walk through a demo decision (sample data)
        </Button>
        <Button variant="ghost" className="h-10" asChild>
          <Link to="/decisions">View Decision Ledger</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
