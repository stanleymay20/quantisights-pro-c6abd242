-- Durable source-level idempotency for all decision-generation pipelines.
-- Existing duplicate rows are preserved for audit history; only the earliest
-- row for each detected source is backfilled with the key so the unique index
-- can be installed without deleting historical decisions.

ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS source_idempotency_key text;

WITH candidates AS (
  SELECT
    id,
    organization_id,
    COALESCE(
      CASE
        WHEN advisory_instance_id IS NOT NULL
          THEN 'advisory:' || advisory_instance_id::text
      END,
      CASE
        WHEN explanation_metadata->'source'->>'kind' IN ('advisory', 'insight')
         AND NULLIF(explanation_metadata->'source'->>'id', '') IS NOT NULL
          THEN (explanation_metadata->'source'->>'kind') || ':' || (explanation_metadata->'source'->>'id')
      END,
      CASE
        WHEN linked_aicis_prediction_id IS NOT NULL
          THEN 'aicis_prediction:' || linked_aicis_prediction_id::text
      END,
      CASE
        WHEN linked_aicis_recommendation_id IS NOT NULL
          THEN 'aicis_recommendation:' || linked_aicis_recommendation_id::text
      END
    ) AS source_key,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id,
        COALESCE(
          CASE WHEN advisory_instance_id IS NOT NULL THEN 'advisory:' || advisory_instance_id::text END,
          CASE
            WHEN explanation_metadata->'source'->>'kind' IN ('advisory', 'insight')
             AND NULLIF(explanation_metadata->'source'->>'id', '') IS NOT NULL
              THEN (explanation_metadata->'source'->>'kind') || ':' || (explanation_metadata->'source'->>'id')
          END,
          CASE WHEN linked_aicis_prediction_id IS NOT NULL THEN 'aicis_prediction:' || linked_aicis_prediction_id::text END,
          CASE WHEN linked_aicis_recommendation_id IS NOT NULL THEN 'aicis_recommendation:' || linked_aicis_recommendation_id::text END
        )
      ORDER BY created_at NULLS LAST, id
    ) AS source_rank
  FROM public.decision_ledger
)
UPDATE public.decision_ledger AS decision
SET source_idempotency_key = candidates.source_key
FROM candidates
WHERE decision.id = candidates.id
  AND candidates.source_key IS NOT NULL
  AND candidates.source_rank = 1
  AND decision.source_idempotency_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS decision_ledger_org_source_idempotency_uidx
  ON public.decision_ledger (organization_id, source_idempotency_key)
  WHERE source_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.decision_ledger.source_idempotency_key IS
  'Stable source identity used to make decision-generation pipelines race-safe and replay-safe.';
