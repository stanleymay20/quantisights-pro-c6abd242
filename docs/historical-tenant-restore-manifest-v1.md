# Historical tenant restore manifest v1

This document is evidence for the staging-only historical Quantivis tenant restoration workflow.

## Source and destination

- Historical source project ref: `itpwpnwzzitkelffttyx`
- Historical source organisation: `617a91a0-0e9a-4b35-86fc-c6c6d56bf37e` (`Meridian Analytics Inc.`)
- Staging project ref: `cmnihsbdbpubznlkmjbc`
- Current staging replacement-shell organisation: `b094f2c7-4997-48d2-893f-72494995111d`

Production is not part of this restore workflow.

## Snapshot rule

The historical project is still running scheduled system jobs. A restore batch therefore MUST set one immutable `source_snapshot_at` timestamp before transfer starts.

Every source query MUST include the corresponding table's timestamp column with `<= source_snapshot_at`.

| Table | Snapshot column |
| --- | --- |
| organizations | created_at |
| profiles | created_at |
| organization_members | created_at |
| workspaces | created_at |
| workspace_members | added_at |
| projects | created_at |
| kpis | created_at |
| decision_ledger | created_at |
| insights | created_at |
| data_sources | created_at |
| reports | created_at |
| datasets | created_at |
| dataset_versions | created_at |
| raw_records | ingested_at |
| metrics | created_at |
| metric_aggregates | computed_at |
| decision_outcomes | created_at |
| forecast_results | generated_at |
| scenario_results | created_at |
| executive_briefs | generated_at |
| audit_log | created_at |

## Identity mapping

The historical Gmail identity and current staging Gmail identity have different Auth UUIDs. No FK-bearing historical row may be promoted until the identity map is explicitly verified.

- Historical Gmail Auth UUID: `3cfe915e-c662-44fb-8690-75be940a1cba`
- Staging Gmail Auth UUID: `68d0775d-30a3-4ce1-a493-1381c6281fe4`

The GISMA historical identity is handled separately and must not be silently merged into the data-bearing Gmail tenant.

## Schema compatibility

The verified core table set contains 21 tables. Twenty have matching historical/staging schema signatures. `decision_ledger` has 51 historical columns and 54 staging columns. The three staging-only fields are compatible with a source-preserving import because:

- `decision_audit_source` is NOT NULL with default `legacy`;
- `source_idempotency_key` is nullable;
- `dataset_id` is nullable.

Historical values must never be invented for these fields.

## Promotion rule

Quarantine receipt is not restoration. Promotion to `public.*` is blocked until all of the following are true:

1. table counts reconcile to the pinned snapshot;
2. chunk receipt counts and hashes reconcile;
3. source IDs are unique and preserved unless an explicit identity map is required;
4. all FK targets are present or explicitly mapped;
5. workspace/organisation ownership is reconciled;
6. RLS acceptance passes as the mapped staging user;
7. the replacement-shell disposition is explicitly decided;
8. a separate promotion migration/PR is reviewed and certified.
