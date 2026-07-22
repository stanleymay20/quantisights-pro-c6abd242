-- ════════════════════════════════════════════════════════════════════
-- PART 1 — SOURCE CLASSIFICATION
-- New column `data_origin` (client/internal/external) — distinct from
-- the existing `source_type` (csv/manual/webhook) which describes
-- the technical ingestion channel, not the data layer.
-- ════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.data_origin_type AS ENUM ('client', 'internal', 'external');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.visibility_scope_type AS ENUM ('private', 'org_shared', 'global');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- raw_records
ALTER TABLE public.raw_records
  ADD COLUMN IF NOT EXISTS data_origin public.data_origin_type NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS source_name text NOT NULL DEFAULT 'client_upload',
  ADD COLUMN IF NOT EXISTS trust_level smallint NOT NULL DEFAULT 100 CHECK (trust_level BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS visibility_scope public.visibility_scope_type NOT NULL DEFAULT 'private';

-- metrics
ALTER TABLE public.metrics
  ADD COLUMN IF NOT EXISTS data_origin public.data_origin_type NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS source_name text NOT NULL DEFAULT 'client_upload',
  ADD COLUMN IF NOT EXISTS trust_level smallint NOT NULL DEFAULT 100 CHECK (trust_level BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS visibility_scope public.visibility_scope_type NOT NULL DEFAULT 'private';

-- metric_aggregates
ALTER TABLE public.metric_aggregates
  ADD COLUMN IF NOT EXISTS data_origin public.data_origin_type NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS source_name text NOT NULL DEFAULT 'client_upload',
  ADD COLUMN IF NOT EXISTS trust_level smallint NOT NULL DEFAULT 100 CHECK (trust_level BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS visibility_scope public.visibility_scope_type NOT NULL DEFAULT 'private';

-- metric_summaries
ALTER TABLE public.metric_summaries
  ADD COLUMN IF NOT EXISTS data_origin public.data_origin_type NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS source_name text NOT NULL DEFAULT 'client_upload',
  ADD COLUMN IF NOT EXISTS trust_level smallint NOT NULL DEFAULT 100 CHECK (trust_level BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS visibility_scope public.visibility_scope_type NOT NULL DEFAULT 'private';

-- Backfill all existing rows = client (defaults already set, but make explicit)
UPDATE public.raw_records       SET data_origin = 'client', source_name = 'client_upload' WHERE source_name IS NULL OR source_name = '';
UPDATE public.metrics           SET data_origin = 'client', source_name = 'client_upload' WHERE source_name IS NULL OR source_name = '';
UPDATE public.metric_aggregates SET data_origin = 'client', source_name = 'client_upload' WHERE source_name IS NULL OR source_name = '';
UPDATE public.metric_summaries  SET data_origin = 'client', source_name = 'client_upload' WHERE source_name IS NULL OR source_name = '';

-- Helpful indexes for filtering/joining by origin
CREATE INDEX IF NOT EXISTS idx_metrics_data_origin
  ON public.metrics (organization_id, dataset_id, data_origin);
CREATE INDEX IF NOT EXISTS idx_metric_summaries_data_origin
  ON public.metric_summaries (organization_id, dataset_id, data_origin);
CREATE INDEX IF NOT EXISTS idx_metric_aggregates_data_origin
  ON public.metric_aggregates (organization_id, dataset_id, data_origin);

-- ════════════════════════════════════════════════════════════════════
-- PART 2 — PROVENANCE on advisories + decisions
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.advisory_instances
  ADD COLUMN IF NOT EXISTS evidence_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS advisory_lane text NOT NULL DEFAULT 'primary'
    CHECK (advisory_lane IN ('primary', 'market_intelligence'));

ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS evidence_sources jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_advisory_lane
  ON public.advisory_instances (organization_id, advisory_lane, status);

COMMENT ON COLUMN public.advisory_instances.evidence_sources IS
  'Array of {source_type, source_name, metric_type, dataset_id, contribution_weight} — full provenance';
COMMENT ON COLUMN public.advisory_instances.advisory_lane IS
  'primary = uses client data; market_intelligence = internal/external only (rendered in separate lane)';

-- ════════════════════════════════════════════════════════════════════
-- PART 3 — BLENDING ENGINE (deterministic plpgsql)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.blend_evidence(_inputs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _input         jsonb;
  _data_origin   text;
  _value         numeric;
  _confidence    numeric;
  _recency_days  numeric;
  _sample_size   numeric;
  _trust_level   numeric;
  _origin_weight numeric;
  _recency_factor numeric;
  _sample_factor  numeric;
  _trust_factor   numeric;
  _final_weight   numeric;
  _client_value_sum numeric := 0;
  _client_weight_sum numeric := 0;
  _all_value_sum    numeric := 0;
  _all_weight_sum   numeric := 0;
  _client_conf_sum  numeric := 0;
  _all_conf_sum     numeric := 0;
  _has_client       boolean := false;
  _breakdown        jsonb := '[]'::jsonb;
  _blended_value    numeric;
  _blended_conf     numeric;
BEGIN
  IF _inputs IS NULL OR jsonb_array_length(_inputs) = 0 THEN
    RETURN jsonb_build_object(
      'blended_value', NULL,
      'blended_confidence', 0,
      'has_client_anchor', false,
      'contribution_breakdown', '[]'::jsonb
    );
  END IF;

  FOR _input IN SELECT jsonb_array_elements(_inputs)
  LOOP
    _data_origin   := COALESCE(_input->>'source_type', 'external');
    _value         := COALESCE((_input->>'value')::numeric, 0);
    _confidence    := COALESCE((_input->>'confidence')::numeric, 50);
    _recency_days  := COALESCE((_input->>'recency_days')::numeric, 0);
    _sample_size   := COALESCE((_input->>'sample_size')::numeric, 1);
    _trust_level   := COALESCE((_input->>'trust_level')::numeric, 50);

    -- Origin priority: client=1.0, internal=0.4, external=0.2
    _origin_weight := CASE _data_origin
      WHEN 'client'   THEN 1.0
      WHEN 'internal' THEN 0.4
      WHEN 'external' THEN 0.2
      ELSE 0.1
    END;

    -- Recency: linear decay over 90 days, floor 0.2
    _recency_factor := GREATEST(0.2, 1.0 - (_recency_days / 90.0));

    -- Sample size: log-scaled, capped at 1.0 (n=100 = full weight)
    _sample_factor := LEAST(1.0, ln(GREATEST(_sample_size, 1) + 1) / ln(101));

    -- Trust: linear 0–1
    _trust_factor := _trust_level / 100.0;

    _final_weight := _origin_weight * _recency_factor * _sample_factor * _trust_factor;

    IF _data_origin = 'client' THEN
      _has_client := true;
      _client_value_sum  := _client_value_sum  + (_value * _final_weight);
      _client_weight_sum := _client_weight_sum + _final_weight;
      _client_conf_sum   := _client_conf_sum   + (_confidence * _final_weight);
    END IF;

    _all_value_sum  := _all_value_sum  + (_value * _final_weight);
    _all_weight_sum := _all_weight_sum + _final_weight;
    _all_conf_sum   := _all_conf_sum   + (_confidence * _final_weight);

    _breakdown := _breakdown || jsonb_build_array(jsonb_build_object(
      'source_type',     _data_origin,
      'source_name',     _input->>'source_name',
      'value',           _value,
      'confidence',      _confidence,
      'final_weight',    round(_final_weight, 4),
      'origin_weight',   _origin_weight,
      'recency_factor',  round(_recency_factor, 3),
      'sample_factor',   round(_sample_factor, 3),
      'trust_factor',    round(_trust_factor, 3)
    ));
  END LOOP;

  -- Rule: client data anchors the value. Internal/external only adjust confidence.
  IF _has_client AND _client_weight_sum > 0 THEN
    _blended_value := _client_value_sum / _client_weight_sum;
  ELSIF _all_weight_sum > 0 THEN
    _blended_value := _all_value_sum / _all_weight_sum;
  ELSE
    _blended_value := NULL;
  END IF;

  -- Confidence uses ALL sources (client + context)
  IF _all_weight_sum > 0 THEN
    _blended_conf := LEAST(100, GREATEST(0, _all_conf_sum / _all_weight_sum));
  ELSE
    _blended_conf := 0;
  END IF;

  RETURN jsonb_build_object(
    'blended_value', _blended_value,
    'blended_confidence', round(_blended_conf, 1),
    'has_client_anchor', _has_client,
    'client_weight_total', round(COALESCE(_client_weight_sum, 0), 4),
    'all_weight_total', round(_all_weight_sum, 4),
    'contribution_breakdown', _breakdown
  );
END;
$$;

COMMENT ON FUNCTION public.blend_evidence(jsonb) IS
  'Deterministic blending: client data anchors value, internal/external adjust confidence. Penalizes stale data and small samples.';

-- ════════════════════════════════════════════════════════════════════
-- PART 7 — SAFETY: client metric values cannot be overwritten by
-- internal/external sources. Insert/update from non-client source is
-- blocked if a client-origin row already exists for the same key.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_client_metric_truth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only enforce on non-client writes
  IF NEW.data_origin = 'client' THEN
    RETURN NEW;
  END IF;

  -- Block if a client-sourced row already exists for the same business key
  IF EXISTS (
    SELECT 1 FROM public.metrics
    WHERE organization_id = NEW.organization_id
      AND dataset_id IS NOT DISTINCT FROM NEW.dataset_id
      AND metric_type = NEW.metric_type
      AND date = NEW.date
      AND data_origin = 'client'
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Safety: cannot overwrite client-sourced metric (%, %, %) with % data',
      NEW.metric_type, NEW.date, NEW.dataset_id, NEW.data_origin
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_metric_truth ON public.metrics;
CREATE TRIGGER trg_protect_client_metric_truth
  BEFORE INSERT OR UPDATE ON public.metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_client_metric_truth();

-- ════════════════════════════════════════════════════════════════════
-- Helper RPC: validate evidence_sources structure (used by edge fns)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_evidence_sources(_sources jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _weight_sum numeric := 0;
BEGIN
  IF _sources IS NULL OR jsonb_typeof(_sources) <> 'array' THEN
    RETURN false;
  END IF;

  FOR _item IN SELECT jsonb_array_elements(_sources)
  LOOP
    IF NOT (_item ? 'source_type' AND _item ? 'source_name') THEN
      RETURN false;
    END IF;
    IF (_item->>'source_type') NOT IN ('client', 'internal', 'external') THEN
      RETURN false;
    END IF;
    _weight_sum := _weight_sum + COALESCE((_item->>'contribution_weight')::numeric, 0);
  END LOOP;

  -- Allow empty (legacy) or sums roughly to 1.0 (±0.05)
  RETURN _weight_sum = 0 OR (_weight_sum BETWEEN 0.95 AND 1.05);
END;
$$;