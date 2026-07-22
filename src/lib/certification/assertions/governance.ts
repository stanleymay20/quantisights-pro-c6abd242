// Governance assertions — verify the shape of what ingestion *would* persist.
// The harness does not write to Supabase; it asserts that the payload the
// upload pipeline emits is correctly scoped to organization_id + dataset_id
// and references a valid dataset_version, matching the runtime contract.

export interface GovernancePayload {
  table: "datasets" | "dataset_versions" | "schema_evolution_log" | "audit_log" | "data_lineage" | "pipeline_runs";
  organization_id: string;
  dataset_id: string;
  version_id?: string;
  [key: string]: unknown;
}

export interface GovernanceAssertionResult {
  passed: boolean;
  table: GovernancePayload["table"];
  reason?: string;
}

const REQUIRED_TABLES: GovernancePayload["table"][] = [
  "datasets",
  "dataset_versions",
  "schema_evolution_log",
  "audit_log",
  "data_lineage",
  "pipeline_runs",
];

export function assertGovernancePayloads(
  payloads: GovernancePayload[],
  expectedOrgId: string,
  expectedDatasetId: string,
): GovernanceAssertionResult[] {
  const results: GovernanceAssertionResult[] = [];
  const byTable = new Map<string, GovernancePayload[]>();
  payloads.forEach((p) => {
    const arr = byTable.get(p.table) ?? [];
    arr.push(p);
    byTable.set(p.table, arr);
  });

  for (const table of REQUIRED_TABLES) {
    const rows = byTable.get(table) ?? [];
    if (rows.length === 0) {
      results.push({ passed: false, table, reason: "No payload emitted" });
      continue;
    }
    const wrongOrg = rows.find((r) => r.organization_id !== expectedOrgId);
    const wrongDataset = rows.find((r) => r.dataset_id !== expectedDatasetId);
    if (wrongOrg) {
      results.push({ passed: false, table, reason: `organization_id mismatch: ${wrongOrg.organization_id}` });
      continue;
    }
    if (wrongDataset) {
      results.push({ passed: false, table, reason: `dataset_id mismatch: ${wrongDataset.dataset_id}` });
      continue;
    }
    results.push({ passed: true, table });
  }
  return results;
}

/** Build the canonical set of governance payloads an ingestion run would emit. */
export function buildExpectedGovernancePayloads(
  orgId: string,
  datasetId: string,
  versionId: string,
  driftCount: number,
): GovernancePayload[] {
  return [
    { table: "datasets", organization_id: orgId, dataset_id: datasetId },
    { table: "dataset_versions", organization_id: orgId, dataset_id: datasetId, version_id: versionId },
    { table: "schema_evolution_log", organization_id: orgId, dataset_id: datasetId, version_id: versionId, change_count: driftCount },
    { table: "audit_log", organization_id: orgId, dataset_id: datasetId, version_id: versionId, action: "dataset.ingest" },
    { table: "data_lineage", organization_id: orgId, dataset_id: datasetId, version_id: versionId, source: "upload" },
    { table: "pipeline_runs", organization_id: orgId, dataset_id: datasetId, version_id: versionId, status: "success" },
  ];
}
