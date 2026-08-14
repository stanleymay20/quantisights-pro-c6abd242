from pathlib import Path

path = Path("supabase/functions/connector-credential-store/index.ts")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, found {count}: {old[:160]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'type ScheduleKind = "manual" | "every_5_min" | "hourly" | "daily";\n',
    'type ScheduleKind = "manual" | "every_5_min" | "hourly" | "daily";\n'
    'const PILOT_CONNECTOR_TYPES = new Set(["salesforce", "hubspot"]);\n',
)

insert_after = '''function parseRequestBody(value: unknown): CredentialStoreRequest | null {
'''
# Add rollback helper immediately before Deno.serve, after parseRequestBody block.
marker = '\nDeno.serve(async (req: Request) => {'
idx = text.index(marker)
helper = r'''

async function rollbackProvisioning(
  svc: ReturnType<typeof createClient>,
  input: { connectorId: string; dataSourceId: string | null; vaultNames: string[] },
): Promise<void> {
  const failures: string[] = [];
  const tryCleanup = async (label: string, action: () => PromiseLike<{ error?: { message?: string } | null }>) => {
    try {
      const result = await action();
      if (result?.error) failures.push(`${label}: ${result.error.message ?? "unknown cleanup error"}`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await tryCleanup("schedule", () => svc.from("connector_sync_schedules").delete().eq("connector_id", input.connectorId));
  await tryCleanup("connector", () => svc.from("data_connectors").delete().eq("id", input.connectorId));
  if (input.dataSourceId) {
    await tryCleanup("data_source", () => svc.from("data_sources").delete().eq("id", input.dataSourceId));
  }
  for (const vaultName of input.vaultNames) {
    await tryCleanup(`vault:${vaultName}`, () => svc.rpc("delete_vault_secret", { _name: vaultName }));
  }

  if (failures.length > 0) console.error("connector provisioning rollback incomplete:", failures.join(" | "));
}
'''
text = text[:idx] + helper + text[idx:]

replace_once(
    '    if (!["owner", "admin"].includes(membership.role)) {\n'
    '      return json({ error: "Only owners and admins can add connectors" }, 403);\n'
    '    }\n\n'
    '    // Generate a unique ID for this connector record\n',
    '    if (!["owner", "admin"].includes(membership.role)) {\n'
    '      return json({ error: "Only owners and admins can add connectors" }, 403);\n'
    '    }\n'
    '    if (!PILOT_CONNECTOR_TYPES.has(connector_type)) {\n'
    '      return json({ error: "Connector is not enabled for the paid pilot" }, 403);\n'
    '    }\n\n'
    '    // Generate a unique ID for this connector record\n',
)

replace_once(
    '      if (vErr) {\n'
    '        console.error(`Vault write failed for credential field ${field}:`, vErr.message);\n'
    '        return json({ error: `Unable to securely store connector credential: ${field}` }, 503);\n'
    '      }\n',
    '      if (vErr) {\n'
    '        console.error(`Vault write failed for credential field ${field}:`, vErr.message);\n'
    '        await rollbackProvisioning(svc, { connectorId, dataSourceId: null, vaultNames: Object.values(vaultKeys) });\n'
    '        return json({ error: `Unable to securely store connector credential: ${field}` }, 503);\n'
    '      }\n',
)

old_insert = '''    const { error: insertErr } = await svc
      .from("data_connectors")
      .upsert(connectorRecord, { onConflict: "id" });

    if (insertErr) {
      // If enum type validation fails, fall back to 'rest_api' as the stored type
      // and keep the real type in config.connector_type_detail.
      const fallbackRecord = {
        ...connectorRecord,
        connector_type: "rest_api",
        config: { ...connectorRecord.config as Record<string, unknown>, connector_type_detail: connector_type },
      };
      const { error: fbErr } = await svc.from("data_connectors").upsert(fallbackRecord, { onConflict: "id" });
      if (fbErr) return json({ error: `Failed to save connector: ${fbErr.message}` }, 500);
    }

    // Create a data_sources record (used by the sync pipeline)
    const { data: ds } = await svc
      .from("data_sources")
      .insert({
        organization_id,
        name,
        source_type: "connector",
        connector_type,
        status: "pending",
        config: { connector_id: connectorId, connector_type },
      })
      .select("id")
      .single();

    const dataSourceId = ds?.id ?? null;

    // Link connector to data source
    if (dataSourceId) {
      await svc.from("data_connectors")
        .update({ data_source_id: dataSourceId })
        .eq("id", connectorId);
    }
'''
new_insert = '''    const { error: insertErr } = await svc
      .from("data_connectors")
      .insert(connectorRecord);

    if (insertErr) {
      await rollbackProvisioning(svc, { connectorId, dataSourceId: null, vaultNames: Object.values(vaultKeys) });
      return json({ error: "Failed to save connector" }, 500);
    }

    // Create the linked data_sources record required by the sync pipeline.
    const { data: ds, error: dsErr } = await svc
      .from("data_sources")
      .insert({
        organization_id,
        name,
        source_type: "connector",
        connector_type,
        status: "pending",
        config: { connector_id: connectorId, connector_type },
      })
      .select("id")
      .single();

    if (dsErr || !ds?.id) {
      await rollbackProvisioning(svc, { connectorId, dataSourceId: null, vaultNames: Object.values(vaultKeys) });
      return json({ error: "Failed to create connector data source" }, 503);
    }
    const dataSourceId = ds.id;

    const { error: linkErr } = await svc.from("data_connectors")
      .update({ data_source_id: dataSourceId })
      .eq("id", connectorId)
      .eq("organization_id", organization_id);
    if (linkErr) {
      await rollbackProvisioning(svc, { connectorId, dataSourceId, vaultNames: Object.values(vaultKeys) });
      return json({ error: "Failed to link connector data source" }, 503);
    }
'''
replace_once(old_insert, new_insert)

old_schedule = '''    await svc.from("connector_sync_schedules").insert({
      organization_id,
      connector_id: connectorId,
      schedule_kind,
      next_run_at: nextRunAt,
      created_at: new Date().toISOString(),
    }).then(() => {}); // Non-fatal if table doesn't exist yet

    // Audit log contains Vault field names only, never credential values.
    await svc.from("audit_log").insert({
      organization_id,
      actor_type: "user",
      actor_id: user.id,
      action_type: "connector_created",
      resource_type: "data_connector",
      resource_id: connectorId,
      payload: { connector_type, name, vault_fields: Object.keys(vaultKeys) },
    }).then(() => {});
'''
new_schedule = '''    const { error: scheduleErr } = await svc.from("connector_sync_schedules").insert({
      organization_id,
      connector_id: connectorId,
      schedule_kind,
      next_run_at: nextRunAt,
      created_at: new Date().toISOString(),
    });
    if (scheduleErr) {
      await rollbackProvisioning(svc, { connectorId, dataSourceId, vaultNames: Object.values(vaultKeys) });
      return json({ error: "Failed to schedule connector sync" }, 503);
    }

    // Audit log contains Vault field names only, never credential values.
    const { error: auditErr } = await svc.from("audit_log").insert({
      organization_id,
      actor_type: "user",
      actor_id: user.id,
      action_type: "connector_created",
      resource_type: "data_connector",
      resource_id: connectorId,
      payload: { connector_type, name, vault_fields: Object.keys(vaultKeys) },
    });
    if (auditErr) {
      await rollbackProvisioning(svc, { connectorId, dataSourceId, vaultNames: Object.values(vaultKeys) });
      return json({ error: "Failed to audit connector provisioning" }, 503);
    }
'''
replace_once(old_schedule, new_schedule)

path.write_text(text)
