
-- execution_scores: composite index for latest-score and trend queries
CREATE INDEX idx_exec_scores_trend ON public.execution_scores(organization_id, scope_type, scope_id, computed_at DESC);

-- execution_interventions: composite for duplicate prevention and open-intervention queries
CREATE INDEX idx_exec_interventions_dedup ON public.execution_interventions(execution_plan_id, resolved);
CREATE INDEX idx_exec_interventions_open ON public.execution_interventions(organization_id, resolved, created_at DESC);

-- execution_predictions: composite for sorted risk queries
CREATE INDEX idx_exec_predictions_risk ON public.execution_predictions(organization_id, risk_score DESC);

-- execution_plans: composite for filtered status queries and cross-decision grouping
CREATE INDEX IF NOT EXISTS idx_exec_plans_org_status ON public.execution_plans(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_exec_plans_decision_org ON public.execution_plans(decision_id, organization_id);

-- execution_events: composite for latest-activity lookups (used in stale detection)
CREATE INDEX IF NOT EXISTS idx_exec_events_plan_time ON public.execution_events(execution_plan_id, created_at DESC);
