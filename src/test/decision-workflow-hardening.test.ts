/**
 * Static source-regression checks only.
 *
 * These tests intentionally do not claim to prove PostgreSQL parsing, locking,
 * concurrency, grants, migration application, or rollback behavior. Those
 * properties require the staging integration matrix in the design report.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migrationPath = "supabase/migrations/20260719140000_harden_decision_workflow_integrity.sql";
const rollbackPath = "supabase/rollback/20260719140000_harden_decision_workflow_integrity_rollback.sql";
const migration = read(migrationPath);
const rollback = read(rollbackPath);
const queue = read("src/components/dashboard/DecisionQueue.tsx");
const ledger = read("src/pages/DecisionLedger.tsx");
const modify = read("src/components/dashboard/ModifyDecisionDialog.tsx");
const demo = read("supabase/functions/create-demo-session/index.ts");
const seed = read("supabase/functions/seed-demo-data/index.ts");
const eventStream = read("supabase/functions/event-stream/index.ts");

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|sql|md)$/.test(entry.name) ? [path] : [];
  });
}

const repositorySources = [
  ...sourceFiles("src"),
  ...sourceFiles("supabase/functions"),
  ...sourceFiles("supabase/migrations"),
  ...sourceFiles("supabase/rollback"),
  ...sourceFiles("docs/security"),
];

const functionBody = (name: string) => migration.match(
  new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
)?.[0] ?? "";

const functionSource = (name: string) => {
  const definition = functionBody(name);
  return definition.slice(definition.indexOf("AS $$\n") + 6, definition.lastIndexOf("\n$$;"));
};

describe("decision workflow hardening static migration checks", () => {
  it("rejects direct writes without a session-state or GUC fallback", () => {
    expect(functionBody("enforce_decision_status_trusted_transition")).toContain("decision_transition_authorizations");
    expect(functionBody("enforce_decision_status_trusted_transition")).toContain("DELETE FROM");
    expect(migration).not.toContain("current_setting(");
    expect(migration).not.toContain("set_config(");
    expect(migration).toContain("REVOKE ALL ON TABLE public.decision_transition_authorizations FROM PUBLIC, anon, authenticated, service_role");
  });

  it("contains exact forward provenance checks rather than fragment checks", () => {
    expect(migration).toContain("p.prosrc=v_expected_approve");
    expect(migration).toContain("p.prosrc=v_expected_reject");
    expect(migration).toContain("p.prosrc=v_expected_gate");
    expect(migration).toContain("o.rolname='postgres'");
    expect(migration).toContain("p.proconfig=ARRAY['search_path=public']");
    expect(migration).toContain("aclexplode");
    expect(migration).toContain("complete decision_ledger trigger inventory differs");
    expect(migration).toContain("workflow defaults or existing constraints differ");
  });

  it("contains locked, authorized RPC transitions with explicit search paths", () => {
    for (const name of ["approve_decision", "reject_decision", "dismiss_decision"]) {
      expect(functionBody(name)).toContain("SECURITY DEFINER");
      expect(functionBody(name)).toContain("SET search_path = pg_catalog, public");
      expect(functionBody(name)).toContain("FOR UPDATE");
      expect(functionBody(name)).toContain("decision_transition_authorizations");
    }
  });

  it("defines cascade cleanup and defensive stale-idempotency repair", () => {
    const create = functionBody("create_predecided_decision");
    expect(migration).toContain("decision_creation_idempotency_decision_id_fkey");
    expect(migration).toContain("REFERENCES public.decision_ledger(id) ON DELETE CASCADE");
    expect(create).toContain("IF EXISTS (SELECT 1 FROM public.decision_ledger WHERE id = v_id)");
    expect(create).toContain("DELETE FROM public.decision_creation_idempotency");
    expect(create).toContain("ON CONFLICT DO NOTHING");
    expect(create).toContain("FOR UPDATE");
    expect(seed).toContain('delete().eq("organization_id", orgId)');
    expect(seed).toContain("_idempotency_key");
  });

  it("contains exact rollback provenance, grant, dependency, and FK checks", () => {
    expect(rollback).toContain("md5(p.prosrc)");
    expect(rollback).toContain("length(p.prosrc)");
    expect(rollback).toContain("o.rolname='postgres'");
    expect(rollback).toContain("aclexplode");
    expect(rollback).toContain("decision_creation_idempotency_decision_id_fkey");
    expect(rollback).toContain("confdeltype='c'");
    expect(rollback).toContain("workflow constraint expressions differ");
    expect(rollback).toContain("unexpected external dependency");
    expect(rollback).toContain("DROP uses RESTRICT");
    for (const name of [
      "enforce_decision_status_trusted_transition",
      "create_predecided_decision",
      "dismiss_decision",
      "approve_decision",
      "reject_decision",
    ]) {
      const source = functionSource(name);
      const hash = createHash("md5").update(source).digest("hex");
      expect(rollback).toContain(`md5(p.prosrc)='${hash}'`);
      expect(rollback).toContain(`length(p.prosrc)=${source.length}`);
    }
  });
});

describe("decision workflow hardening static caller checks", () => {
  it("routes frontend resolved states through RPCs and forwards evaluation arguments", () => {
    expect(ledger).toContain('rpc("approve_decision"');
    expect(ledger).toContain('rpc("reject_decision"');
    expect(ledger).toContain("_dataset_id: activeDatasetId ?? undefined");
    expect(ledger).toContain('decision?.recommended_action?.substring(0, 30) ?? "metric"');
    expect(ledger).toContain("_evaluation_window_days: 30");
    expect(ledger).toContain("_suggested_owner: undefined");
    expect(queue).toContain('rpc("approve_decision"');
    expect(queue).toContain('rpc("dismiss_decision"');
    expect(modify).toContain('rpc("approve_decision"');
  });

  it("finds no repository-wide direct resolved-state application writes", () => {
    const resolvedLiteral = /decision_status\s*:\s*["'](?:approved|rejected|dismissed|executable|executed)["']/;
    const directResolvedWrite = /from\(["']decision_ledger["']\)\s*\.(?:insert|update)\(\s*\{[^}]*decision_status\s*:\s*["'](?:approved|rejected|dismissed|executable|executed)["']/s;
    const filesWithDirectResolvedWrites = repositorySources
      .filter((path) => path.startsWith("src/") || path.startsWith("supabase/functions/"))
      .filter((path) => directResolvedWrite.test(read(path)))
      .map((path) => relative(root, join(root, path)));
    expect(filesWithDirectResolvedWrites).toEqual([]);
    for (const source of [demo, seed]) {
      expect(source).toContain('rpc("create_predecided_decision"');
      expect(source).toContain('decision.decision_status === "pending"');
    }
    expect(queue).not.toMatch(resolvedLiteral);
    expect(modify).not.toMatch(resolvedLiteral);
  });

  it("preserves pending-only event ingestion", () => {
    expect(eventStream).toContain('decision_status: "pending"');
    expect(eventStream).toContain('execution_status: "not_started"');
  });

  it("contains no reference to the removed superseded proposal", () => {
    const removedTimestamp = ["20260719", "130000"].join("");
    const removedSlug = ["decision_ledger", "transition_integrity"].join("_");
    const references = repositorySources.filter((path) => {
      if (path === "src/test/decision-workflow-hardening.test.ts") return false;
      const source = read(path);
      return source.includes(removedTimestamp) || source.includes(removedSlug);
    });
    expect(references).toEqual([]);
  });
});
