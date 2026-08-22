-- Enterprise-scale metric read path.
--
-- `metrics_unique_series` is intentionally ordered for write identity:
--   organization_id, dataset_id, metric_type, date, ...
-- That is excellent for idempotent upserts, but it cannot efficiently satisfy
-- the common raw drill-down shape used by the application:
--   WHERE organization_id = ? AND dataset_id = ? ORDER BY date
-- because metric_type sits between dataset_id and date in the unique index.
--
-- Keep write identity and read access as separate concerns. This index supports
-- bounded chronological scans, pagination, range filters, and latest/oldest
-- dataset reads without forcing a sort across every metric series.
CREATE INDEX IF NOT EXISTS idx_metrics_org_dataset_date
  ON public.metrics (organization_id, dataset_id, date, id);

COMMENT ON INDEX public.idx_metrics_org_dataset_date IS
  'Enterprise read path for tenant+dataset chronological metric scans. Complements metrics_unique_series, which remains the idempotent write-identity index.';
