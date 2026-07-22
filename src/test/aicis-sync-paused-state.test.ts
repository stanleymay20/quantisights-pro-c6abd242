import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AICIS Sync admin page: paused/credential-issue state (was always 'Idle')", () => {
  // A surface stuck on repeated 401/403 responses will never recover from
  // retrying alone -- it needs a credential rotation. Showing "Idle" (as
  // this page did for anything that wasn't literally
  // status='failed'|'partial'|'running'|'success') misrepresents that as
  // "nothing scheduled yet" instead of "blocked pending manual action".
  const source = read("src/pages/admin/AicisSync.tsx");

  it("detects a sustained 401/403 pattern as a credential failure, not a generic one", () => {
    expect(source).toContain("function isCredentialFailure(");
    expect(source).toMatch(/HTTP 401\|HTTP 403\|Unauthorized\|Forbidden/);
    expect(source).toContain("CREDENTIAL_FAILURE_THRESHOLD");
  });

  it("statusBadge renders a distinct paused state instead of falling through to Idle", () => {
    expect(source).toContain("Paused — invalid credential");
    expect(source).toMatch(/statusBadge\(\s*status: string \| null,\s*freshness\?: string \| null,\s*errorMessage\?: string \| null,\s*consecutiveFailures\?: number,\s*\)/);
  });

  it("the surface status table passes error message and failure count into statusBadge", () => {
    expect(source).toContain("statusBadge(s?.last_status ?? null, s?.last_success_at, s?.last_error_message, s?.consecutive_failures)");
  });
});
