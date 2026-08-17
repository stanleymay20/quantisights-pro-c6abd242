import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/delete-account/index.ts"),
  "utf8",
);

describe("delete-account production safety", () => {
  it("uses the distributed database limiter for destructive attempts", () => {
    expect(source).not.toContain("../_shared/rate-limiter.ts");
    expect(source).toContain('supabase.rpc(\n      "increment_rate_limit"');
    expect(source).toContain("account-delete:${userId}:${clientIp}");
    expect(source).toContain("if (rateLimitError || typeof deleteAttempts !== \"number\")");
    expect(source).toContain("Account deletion unavailable");
  });

  it("checks mandatory database mutations before deleting the auth identity", () => {
    const helper = source.indexOf("async function assertMutation(");
    const profileDelete = source.indexOf('"Delete user profile"');
    const roleDelete = source.indexOf('"Delete user roles"');
    const authDelete = source.indexOf("supabase.auth.admin.deleteUser(userId)");

    expect(helper).toBeGreaterThan(-1);
    expect(profileDelete).toBeGreaterThan(helper);
    expect(roleDelete).toBeGreaterThan(profileDelete);
    expect(authDelete).toBeGreaterThan(roleDelete);

    expect(source).toContain('"Delete organization memberships"');
    expect(source).toContain('"Delete organization"');
    expect(source).toContain('"Anonymize organization audit log"');
  });

  it("does not expose internal database errors to the caller", () => {
    expect(source).toContain('console.error("delete-account failed:", message)');
    expect(source).toContain('{ error: "Failed to delete account" }');
    expect(source).not.toContain("JSON.stringify({ error: message })");
  });

  it("authenticates before consuming the destructive-action rate limit", () => {
    const authenticate = source.indexOf("supabaseAnon.auth.getUser(token)");
    const rateLimit = source.indexOf('supabase.rpc(\n      "increment_rate_limit"');
    expect(authenticate).toBeGreaterThan(-1);
    expect(rateLimit).toBeGreaterThan(authenticate);
  });
});
