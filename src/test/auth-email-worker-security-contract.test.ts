import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const worker = readFileSync(
  resolve(root, "supabase/functions/process-email-queue/index.ts"),
  "utf8",
);
const supabaseConfig = readFileSync(
  resolve(root, "supabase/config.toml"),
  "utf8",
);

describe("Auth email worker security contract", () => {
  it("uses in-function service-role authorization when gateway JWT verification is disabled", () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.process-email-queue\]\s+verify_jwt = false/,
    );
    expect(worker).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(worker).toContain("token !== supabaseServiceKey");
    expect(worker).toContain("JSON.stringify({ error: 'Forbidden' })");
    expect(worker).not.toContain("claims?.role !== 'service_role'");
  });

  it("checks provider runtime before the no-send authorization probe", () => {
    const runtimeGuard = worker.indexOf(
      "if (!resendApiKey || !resendFromEmail || !supabaseUrl || !supabaseServiceKey)",
    );
    const authGuard = worker.indexOf("token !== supabaseServiceKey");

    expect(runtimeGuard).toBeGreaterThanOrEqual(0);
    expect(authGuard).toBeGreaterThan(runtimeGuard);
  });
});
