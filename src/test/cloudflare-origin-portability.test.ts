import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

async function loadDnsModule() {
  return await import(
    /* @vite-ignore */ pathToFileURL(resolve(root, "scripts/apply-cloudflare-dns.mjs")).href
  );
}

describe("Cloudflare frontend-origin portability", () => {
  it("prefers the vendor-neutral production origin", async () => {
    const { resolveProxyOrigin } = await loadDnsModule();

    expect(
      resolveProxyOrigin({
        APP_PROXY_ORIGIN: "https://quantivis-primary.example.com/path",
        LOVABLE_PROXY_ORIGIN: "legacy.lovable.app",
      }),
    ).toBe("quantivis-primary.example.com");
  });

  it("keeps the Lovable origin as a backward-compatible fallback", async () => {
    const { resolveProxyOrigin } = await loadDnsModule();

    expect(
      resolveProxyOrigin({
        APP_PROXY_ORIGIN: "",
        LOVABLE_PROXY_ORIGIN: "https://legacy.lovable.app/",
      }),
    ).toBe("legacy.lovable.app");
  });

  it("accepts a matching proxied CNAME regardless of hosting vendor", async () => {
    const { evaluateWwwDnsState } = await loadDnsModule();
    const state = evaluateWwwDnsState(
      [
        {
          type: "CNAME",
          name: "www.quantivis.io",
          content: "quantivis-primary.example.com",
          proxied: true,
        },
      ],
      "quantivis-primary.example.com",
    );

    expect(state.ok).toBe(true);
    expect(state.action).toBe("noop");
    expect(state.reason).toContain("configured proxy-origin CNAME");
  });

  it("wires the neutral origin secret without removing the legacy fallback", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/cloudflare-security.yml"),
      "utf8",
    );

    expect(workflow).toContain("APP_PROXY_ORIGIN");
    expect(workflow).toContain("LOVABLE_PROXY_ORIGIN");
  });
});
