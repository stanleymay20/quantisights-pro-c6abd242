import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  upsertCanonicalEntities,
  upsertCanonicalEvents,
  upsertCanonicalMetrics,
  upsertCanonicalRelationships,
} from "../../supabase/functions/_shared/canonical-mapper";

type UpsertCall = {
  table: string;
  rows: Record<string, unknown>[];
  options: { onConflict: string; ignoreDuplicates: boolean };
};

type FakeOptions = {
  lookupError?: unknown;
  upsertErrorTable?: string;
  omitNaturalKey?: string;
};

function makeClient(options: FakeOptions = {}) {
  const upserts: UpsertCall[] = [];
  const inCalls: string[][] = [];
  const filters: Array<[string, string]> = [];
  const persisted = new Map<string, string>();
  let idCounter = 0;

  const from = vi.fn((table: string) => ({
    upsert: vi.fn(async (
      rows: Record<string, unknown>[],
      upsertOptions: { onConflict: string; ignoreDuplicates: boolean },
    ) => {
      upserts.push({ table, rows, options: upsertOptions });
      if (table === "canonical_entities") {
        for (const row of rows) {
          const key = `${String(row.entity_type)}:${String(row.external_id)}`;
          if (!persisted.has(key)) persisted.set(key, `entity-${++idCounter}`);
        }
      }
      return {
        data: null,
        error: options.upsertErrorTable === table ? { message: "upsert unavailable" } : null,
      };
    }),
    select: vi.fn((_columns: string) => {
      const builder = {
        eq: vi.fn((column: string, value: string) => {
          filters.push([column, value]);
          return builder;
        }),
        in: vi.fn(async (_column: string, values: string[]) => {
          inCalls.push(values);
          if (options.lookupError) return { data: null, error: options.lookupError };
          const data = values
            .filter((key) => key !== options.omitNaturalKey)
            .map((key) => ({ id: persisted.get(key) ?? `lookup-${key}`, natural_key: key }));
          return { data, error: null };
        }),
      };
      return builder;
    }),
  }));

  return { client: { from }, from, upserts, inCalls, filters };
}

describe("canonical mapper integrity", () => {
  it("chunks entity reads, preserves tenant/source filters, and returns a complete entity map", async () => {
    const fake = makeClient();
    const entities = Array.from({ length: 501 }, (_, index) => ({
      entity_type: "account",
      external_id: `acct-${index}`,
    }));

    const map = await upsertCanonicalEntities(fake.client, {
      orgId: "org-1",
      connectorId: "connector-1",
      sourceType: "salesforce",
      entities,
    });

    expect(map.size).toBe(501);
    expect(fake.inCalls).toHaveLength(2);
    expect(fake.inCalls[0]).toHaveLength(500);
    expect(fake.inCalls[1]).toHaveLength(1);
    expect(fake.filters).toContainEqual(["organization_id", "org-1"]);
    expect(fake.filters).toContainEqual(["source_type", "salesforce"]);
  });

  it("fails closed when the entity lookup errors or omits a persisted entity", async () => {
    const brokenRead = makeClient({ lookupError: { message: "read unavailable" } });
    await expect(
      upsertCanonicalEntities(brokenRead.client, {
        orgId: "org-1",
        sourceType: "hubspot",
        entities: [{ entity_type: "deal", external_id: "deal-1" }],
      }),
    ).rejects.toThrow("canonical_entities lookup failed: read unavailable");

    const incomplete = makeClient({ omitNaturalKey: "deal:deal-1" });
    await expect(
      upsertCanonicalEntities(incomplete.client, {
        orgId: "org-1",
        sourceType: "hubspot",
        entities: [{ entity_type: "deal", external_id: "deal-1" }],
      }),
    ).rejects.toThrow("canonical_entities lookup missing persisted entity: deal:deal-1");
  });

  it("uses generated event and metric dedupe columns as PostgREST conflict targets", async () => {
    const fake = makeClient();

    await upsertCanonicalEvents(fake.client, {
      orgId: "org-1",
      connectorId: "connector-1",
      sourceType: "salesforce",
      events: [{ event_type: "account.updated", external_id: null, occurred_at: "2026-08-14T12:00:00Z" }],
    });
    await upsertCanonicalMetrics(fake.client, {
      orgId: "org-1",
      connectorId: "connector-1",
      sourceType: "snowflake",
      metrics: [{ metric_key: "revenue.mrr", period_start: "2026-08-14", value: 42 }],
    });

    const event = fake.upserts.find((call) => call.table === "canonical_events");
    const metric = fake.upserts.find((call) => call.table === "canonical_metrics");
    expect(event?.options.onConflict).toBe(
      "organization_id,source_type,event_type,external_id_dedupe,occurred_at",
    );
    expect(metric?.options.onConflict).toBe(
      "organization_id,metric_key,period_start,period_grain,connector_id_dedupe,dimensions",
    );
  });

  it("rejects invalid dates, non-finite metrics, and unresolved declared entity references", async () => {
    const fake = makeClient();

    await expect(
      upsertCanonicalEvents(fake.client, {
        orgId: "org-1",
        sourceType: "hubspot",
        events: [{ event_type: "deal.updated", occurred_at: "not-a-date" }],
      }),
    ).rejects.toThrow("events[0].occurred_at invalid");

    await expect(
      upsertCanonicalMetrics(fake.client, {
        orgId: "org-1",
        sourceType: "snowflake",
        metrics: [{ metric_key: "revenue", period_start: "2026-08-14", value: Number.NaN }],
      }),
    ).rejects.toThrow("metrics[0].value invalid");

    await expect(
      upsertCanonicalEvents(fake.client, {
        orgId: "org-1",
        sourceType: "salesforce",
        events: [{
          event_type: "account.updated",
          occurred_at: "2026-08-14T12:00:00Z",
          entity_type: "account",
          entity_external_id: "acct-1",
        }],
        entityIdMap: new Map(),
      }),
    ).rejects.toThrow("events[0] entity reference unresolved: account:acct-1");
  });

  it("never silently drops an unresolved relationship edge", async () => {
    const fake = makeClient();
    await expect(
      upsertCanonicalRelationships(fake.client, {
        orgId: "org-1",
        sourceType: "hubspot",
        relationships: [{
          relationship_type: "contact_of",
          from_entity_type: "contact",
          from_external_id: "contact-1",
          to_entity_type: "account",
          to_external_id: "account-1",
        }],
        entityIdMap: new Map([["contact:contact-1", "entity-contact"]]),
      }),
    ).rejects.toThrow("relationships[0] entity reference unresolved: account:account-1");
    expect(fake.upserts.some((call) => call.table === "canonical_relationships")).toBe(false);
  });

  it("surfaces canonical upsert failures with the table name", async () => {
    const fake = makeClient({ upsertErrorTable: "canonical_metrics" });
    await expect(
      upsertCanonicalMetrics(fake.client, {
        orgId: "org-1",
        sourceType: "bigquery",
        metrics: [{ metric_key: "cost", period_start: "2026-08-14", value: 10 }],
      }),
    ).rejects.toThrow("canonical_metrics upsert failed: upsert unavailable");
  });

  it("keeps mapper and migration conflict contracts aligned", () => {
    const mapper = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/canonical-mapper.ts"),
      "utf8",
    );
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260814183000_fix_canonical_dedupe_conflict_targets.sql"),
      "utf8",
    );

    expect(mapper).not.toContain("@ts-nocheck");
    expect(mapper).not.toMatch(/\bany\b/);
    expect(migration).toContain("external_id_dedupe");
    expect(migration).toContain("connector_id_dedupe");
    expect(migration).toContain("CREATE UNIQUE INDEX uq_cev_dedupe");
    expect(migration).toContain("CREATE UNIQUE INDEX uq_cmet_dedupe");
    expect(mapper).toContain("external_id_dedupe,occurred_at");
    expect(mapper).toContain("connector_id_dedupe,dimensions");
  });
});
