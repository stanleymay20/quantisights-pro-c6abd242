import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const ui = read("src/pages/DataConnectors.tsx");
const edge = read("supabase/functions/db-connector/index.ts");

describe("data connector truth semantics", () => {
  it("does not convert an unavailable connector inventory into an empty inventory", () => {
    expect(ui).toContain("const [existingConnectors, setExistingConnectors] = useState<any[] | null>(null)");
    expect(ui).toContain("const [inventoryError, setInventoryError] = useState<string | null>(null)");
    expect(ui).toContain("const { data, error } = await supabase.from(\"connector_configs\")");
    expect(ui).toContain("Connector inventory is unavailable");
    expect(ui).not.toContain("setExistingConnectors(data || [])");
  });

  it("validates HTTP and payload evidence before declaring connector operations successful", () => {
    expect(ui).toContain("!storeRes.ok || !storeData || storeData.success !== true");
    expect(ui).toContain("const syncVerified = syncRes.ok && !!syncData && syncData.success === true");
    expect(ui).toContain("!res.ok || !data || data.success !== true");
    expect(ui).toContain("!Array.isArray(data.tables)");
    expect(ui).toContain("!Array.isArray(data.rows)");
  });

  it("checks mapping and schedule persistence and starts connector state as pending", () => {
    expect(ui).toContain("const { error: mmErr }");
    expect(ui).toContain("if (mmErr) throw mmErr");
    expect(ui).toContain("const { error: schedErr }");
    expect(ui).toContain("if (schedErr) throw schedErr");
    expect(ui).toContain('connection_status: "pending"');
  });

  it("does not manufacture a zero record count for failed or unavailable UI syncs", () => {
    expect(ui).toContain("records: number | null");
    expect(ui).toContain("setSyncResult({ records: null");
    expect(ui).not.toContain("setSyncResult({ records: 0");
  });

  it("keeps missing database-runtime record evidence unknown and fail-closed", () => {
    expect(edge).toContain("function runtimeRecords(runtime: RuntimeResult): number | null");
    expect(edge).toContain("runtime.body.records === null || runtime.body.records === undefined");
    expect(edge).toContain("return null");
    expect(edge).toContain("records === null");
    expect(edge).toContain("Database sync did not return a verified records count");
    expect(edge).not.toContain("Number(runtime.body.records ?? 0)");
    expect(edge).not.toContain("body: { records: 0, errors:");
  });
});
