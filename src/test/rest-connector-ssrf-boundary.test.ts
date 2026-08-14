import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const guard = read("supabase/functions/_shared/outbound-http.ts");
const connector = read("supabase/functions/connector-rest-sync/index.ts");
const ci = read(".github/workflows/ci.yml");

describe("REST connector SSRF boundary", () => {
  it("routes connector HTTP requests through the shared outbound guard", () => {
    expect(connector).toContain('safeOutboundFetch');
    expect(connector).toContain('from "../_shared/outbound-http.ts"');
    expect(connector).not.toContain('await fetch(url.toString(), { method, headers })');
    expect(ci).toContain("deno check supabase/functions/connector-rest-sync/index.ts");
  });

  it("requires HTTPS and rejects embedded URL credentials", () => {
    expect(guard).toContain('url.protocol !== "https:"');
    expect(guard).toContain("Outbound connector URLs must use HTTPS");
    expect(guard).toContain("url.username || url.password");
    expect(guard).toContain("must not embed credentials");
  });

  it("rejects local/private/reserved IP ranges and internal host suffixes", () => {
    for (const marker of [
      'a === 10',
      'a === 127',
      'a === 169 && b === 254',
      'a === 172 && b >= 16 && b <= 31',
      'a === 192 && b === 168',
      'ip === "::1"',
      'ip.startsWith("fc")',
      'ip.startsWith("fd")',
      '".localhost"',
      '".local"',
      '".internal"',
    ]) {
      expect(guard).toContain(marker);
    }
  });

  it("resolves both A and AAAA records before outbound fetch", () => {
    expect(guard).toContain('["A", "AAAA"] as const');
    expect(guard).toContain("Deno.resolveDns(host, recordType)");
    expect(guard).toContain("resolves to a private, local, reserved, or non-routable address");
  });

  it("uses manual redirects and refuses credential-bearing cross-origin redirects", () => {
    expect(guard).toContain('redirect: "manual"');
    expect(guard).toContain("next.origin !== current.origin");
    expect(guard).toContain("Cross-origin redirects are not allowed for credentialed connectors");
  });
});
