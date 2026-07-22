DO $$ BEGIN
  CREATE TYPE public.intervention_status AS ENUM (
    'proposed','acknowledged','assigned','in_progress','deferred','escalated','resolved','dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.intervention_tier AS ENUM ('informational','elevated','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.executive_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  intervention_type text NOT NULL,
  title text NOT NULL,
  summary text,
  rationale text,
  recommended_action text,
  severity text NOT NULL DEFAULT 'medium',
  urgency text NOT NULL DEFAULT 'medium',
  business_impact numeric NOT NULL DEFAULT 0.5,
  organizational_exposure numeric NOT NULL DEFAULT 0.5,
  uncertainty_score numeric NOT NULL DEFAULT 0.3,
  decision_pressure_score numeric NOT NULL DEFAULT 0.5,
  intervention_priority_score integer NOT NULL DEFAULT 0,
  escalation_tier public.intervention_tier NOT NULL DEFAULT 'informational',
  scoring_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributing_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_version integer NOT NULL DEFAULT 1,
  owner_id uuid,
  status public.intervention_status NOT NULL DEFAULT 'proposed',
  acknowledged_at timestamptz,
  assigned_at timestamptz,
  acted_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  outcome_score integer,
  decision_id uuid,
  execution_plan_id uuid,
  sla_due_at timestamptz,
  last_escalated_at timestamptz,
  escalation_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz NOT NULL DEFAULT now()
);