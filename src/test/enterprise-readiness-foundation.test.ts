import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("enterprise readiness foundation", () => {
  it("defines centralized metadata for every audited route", () => {
    const metadataPath = resolve(root, "src/lib/page-metadata.ts");
    expect(existsSync(metadataPath)).toBe(true);

    const metadata = readFileSync(metadataPath, "utf8");
    const auditedRoutes = [
      "/trust",
      "/security",
      "/how-ai-is-used",
      "/ai-system-classification",
      "/impressum",
      "/pricing",
      "/compare",
      "/copilot",
      "/embed",
      "/decision-intelligence-platforms",
    ];

    for (const route of auditedRoutes) {
      expect(metadata).toContain(`"${route}"`);
    }
  });

  it("serves the trust center at /trust and redirects the legacy route", () => {
    const routes = read("src/routes/index.tsx");

    expect(routes).toContain('{ path: "/trust", element: <SecurityTrustCenter />, layout: "public" }');
    expect(routes).toContain(
      '{ path: "/trust-center", element: <Navigate to="/trust" replace />, layout: "none" }',
    );
  });

  it("does not deliver CSP through a meta element", () => {
    expect(read("index.html")).not.toMatch(
      /http-equiv=["']Content-Security-Policy["']/i,
    );
  });

  it("allows configured observability endpoints and blob workers in every CSP", () => {
    const policies = [
      read("public/_headers"),
      read("public/_worker.js"),
      read("vercel.json"),
    ];

    for (const policy of policies) {
      expect(policy).toContain("eu-assets.i.posthog.com");
      expect(policy).toContain("eu.posthog.com");
      expect(policy).toContain("ingest.de.sentry.io");
      expect(policy).toContain("worker-src 'self' blob:");
    }
  });

  it("defines separate standard and embed framing policies", () => {
    const worker = read("public/_worker.js");

    expect(worker).toContain("frame-ancestors 'none'");
    expect(worker).toContain("EMBED_ALLOWED_ORIGINS");
    expect(worker).toMatch(/pathname.*\/embed/s);
  });

  it("does not frame-block OAuth broker and callback routes", async () => {
    const worker = read("public/_worker.js");
    const cloudflareSecurity = await import(
      /* @vite-ignore */ pathToFileURL(resolve(root, "scripts/apply-cloudflare-security.mjs")).href
    );
    const cloudflareWorker = await import(
      /* @vite-ignore */ pathToFileURL(resolve(root, "scripts/apply-cloudflare-security-worker.mjs")).href
    );
    const rule = cloudflareSecurity.buildCloudflareHeaderRule();
    const generatedWorker = cloudflareWorker.buildSecurityWorkerScript();

    for (const path of ["/~oauth/", "/auth/callback"]) {
      expect(worker).toContain(path);
      expect(rule.expression).toContain(path);
      expect(generatedWorker).toContain(path);
    }

    expect(generatedWorker).toContain("pathname === OAUTH_CALLBACK_PATH");
  });

  it("uses evidence-safe authentication claims", () => {
    const authLayout = read("src/components/auth/AuthLayout.tsx");

    expect(authLayout).not.toContain("SOC 2 Type II controls");
    expect(authLayout).not.toContain("Enterprise SSO · SCIM · MFA");
    expect(authLayout).toContain(
      "Controls aligned to SOC 2; independent audit in progress",
    );
    expect(authLayout).toContain(
      "Enterprise SSO, SCIM, and MFA available when configured",
    );
  });

  it("treats missing operational evidence as unknown", async () => {
    const statusPath = resolve(root, "src/lib/system-status.ts");
    const exists = existsSync(statusPath);
    expect(exists).toBe(true);
    if (!exists) return;

    const moduleUrl = pathToFileURL(statusPath).href;
    const { deriveSystemStatus } = await import(/* @vite-ignore */ moduleUrl);

    expect(
      deriveSystemStatus({
        queriesSucceeded: true,
        recordedRuns: 0,
        criticalFailures: 0,
        nonCriticalFailures: 0,
      }),
    ).toBe("unknown");
    expect(
      deriveSystemStatus({
        queriesSucceeded: false,
        recordedRuns: 10,
        criticalFailures: 0,
        nonCriticalFailures: 0,
      }),
    ).toBe("unknown");
    expect(
      deriveSystemStatus({
        queriesSucceeded: true,
        recordedRuns: 10,
        criticalFailures: 0,
        nonCriticalFailures: 0,
      }),
    ).toBe("operational");
  });

  it("keeps public certification and authentication claims conditional", () => {
    const publicClaims = [
      read("index.html"),
      read("src/pages/Index.tsx"),
      read("src/pages/Pricing.tsx"),
      read("src/pages/SLA.tsx"),
      read("src/pages/SecurityQuestionnaire.tsx"),
      read("src/pages/SecurityTrustCenter.tsx"),
      read("src/lib/copilot-answer-engine.ts"),
    ].join("\n");

    expect(publicClaims).not.toContain("Quantivis guarantees 99.9% monthly uptime");
    expect(publicClaims).not.toContain('"99.9% SLA"');
    expect(publicClaims).not.toContain(
      "MFA is enforced at the route level using AAL2",
    );
    expect(publicClaims).not.toContain(
      "All subprocessors (Supabase, Cloudflare, PostHog EU, Sentry) are SOC 2 Type II certified",
    );
    expect(publicClaims).not.toContain(
      "Compliance coverage includes SOC 2, ISO 27001, EU AI Act, and GDPR",
    );

    expect(publicClaims).toContain("available when configured");
    expect(publicClaims).toContain("contractually committed");
    expect(publicClaims).toContain("Quantivis entity audit");
  });

  it("exposes diligence-grade procurement evidence fields", () => {
    const checklist = read(
      "src/components/security/ProcurementReadinessChecklist.tsx",
    );

    for (const field of [
      "source",
      "method",
      "scope",
      "owner",
      "freshness",
    ]) {
      expect(checklist).toContain(field);
    }
    expect(checklist).toContain("Evidence unavailable");
    expect(checklist).toContain("Verification overdue");
  });

  it("exposes buyer-safe public integrations, copilot, and comparison routes", () => {
    const routes = read("src/routes/index.tsx");
    expect(routes).toContain('path: "/integrations"');
    expect(routes).toContain('{ path: "/copilot", element: <CopilotOverview />, layout: "public" }');

    const compareRoute = routes.match(/\{ path: "\/compare", element: <Compare \/>\, layout: "(?<layout>[^"]+)" \}/);
    expect(compareRoute).not.toBeNull();
    expect(compareRoute?.groups?.layout).toBe("none");
    expect(compareRoute?.groups?.layout).not.toBe("full");
    expect(compareRoute?.groups?.layout).not.toBe("minimal");
    expect(routes).toContain('const Compare = lazy(() => import("@/pages/Compare"))');
  });

  it("initializes both observability clients from the application entrypoint", () => {
    const main = read("src/main.tsx");
    expect(main).toContain('import "@/lib/analytics"');
    expect(main).toContain("recordObservabilityStartup");
  });

  it("uses sanitized scheduler evidence and degrades stale critical jobs", () => {
    const statusPage = read("src/pages/SystemStatus.tsx");
    const statusLogic = read("src/lib/system-status.ts");
    expect(statusPage).toContain('functions.invoke<PublicStatusResponse>("public-system-status")');
    expect(statusLogic).toContain("staleCriticalJobs");
    expect(statusLogic).toContain('return "degraded"');
  });

  it("removes unsupported absolutes from the public trust surface", () => {
    const trust = read("src/pages/SecurityTrustCenter.tsx");
    const evidence = read("src/components/security/AttestedEvidence.tsx");
    for (const unsupported of [
      "Your data never leaves the EU",
      "keeps your AI decisions on-premises",
      "7 autonomous orchestration jobs",
      'value: "100%"',
      "Sub-processors with signed DPA",
    ]) {
      expect(`${trust}\n${evidence}`).not.toContain(unsupported);
    }
  });

  it("reports missing scheduler evidence as telemetry unavailable", () => {
    const statusPage = read("src/pages/SystemStatus.tsx");
    expect(statusPage).toContain("Telemetry unavailable");
    expect(statusPage).toContain("telemetryAvailable");
    for (const field of [
      "last_run_at",
      "next_expected_run_at",
      "severity",
      "evidence_source",
    ]) {
      expect(statusPage).toContain(field);
    }
  });

  it("guards observability test captures to admin or development access", () => {
    const diagnostics = read("src/pages/admin/ObservabilityCheck.tsx");
    expect(diagnostics).toContain("orgRole");
    expect(diagnostics).toContain('orgRole === "owner" || orgRole === "admin"');
    expect(diagnostics).toContain("import.meta.env.DEV");
    expect(diagnostics).toContain("Capture attempted");
    expect(diagnostics).toContain("Provider ingestion not verified");
  });

  it("surfaces unverified hosting headers on trust and security pages", () => {
    expect(existsSync(resolve(root, "src/components/security/SecurityHeaderStatus.tsx"))).toBe(true);
    const diagnostic = read("src/components/security/SecurityHeaderStatus.tsx");
    expect(diagnostic).toContain("Security headers not verified on current deployment.");
    expect(read("src/pages/SecurityTrustCenter.tsx")).toContain("<SecurityHeaderStatus />");
    expect(read("src/pages/Security.tsx")).toContain("<SecurityHeaderStatus />");
  });

  it("documents deployment secrets, hosting headers, and dependency risk", () => {
    const deployment = read("docs/DEPLOYMENT_SECRETS.md");
    expect(deployment).toContain("SUPABASE_ACCESS_TOKEN");
    expect(deployment).toContain("SUPABASE_PROJECT_REF");
    expect(deployment).toContain("itpwpnwzzitkelffttyx");

    const hosting = read("docs/HOSTING_SECURITY_HEADERS.md");
    expect(hosting).toContain("Content-Security-Policy");
    expect(hosting).toContain("X-Frame-Options");
    expect(hosting).toContain("worker-src 'self' blob:");

    const dependencies = read("docs/DEPENDENCY_RISK.md");
    expect(dependencies).toContain("src/lib/workbook-parser.ts");
    expect(dependencies).toContain("xlsx");
    expect(dependencies).toContain("Vite 8");
  });

  it("automates Cloudflare enterprise security headers", () => {
    const apply = read("scripts/apply-cloudflare-security.mjs");
    const dns = read("scripts/apply-cloudflare-dns.mjs");
    const diagnose = read("scripts/diagnose-cloudflare-security-routing.mjs");
    const worker = read("scripts/apply-cloudflare-security-worker.mjs");
    const verify = read("scripts/verify-cloudflare-security.mjs");
    const workflow = read(".github/workflows/cloudflare-security.yml");
    const docs = read("docs/CLOUDFLARE_ENTERPRISE_SECURITY.md");
    const evidence = read("docs/security-controls-evidence.md");
    const pkg = read("package.json");

    for (const expected of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ZONE_ID",
      'http.host eq "${HOSTNAME}"',
      "not starts_with(http.request.uri.path",
      "/~oauth/",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(apply).toContain(expected);
    }

    for (const expected of [
      "content-security-policy",
      "x-frame-options",
      "strict-transport-security",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "cross-origin-resource-policy",
    ]) {
      expect(verify).toContain(expected);
    }

    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("LOVABLE_PROXY_ORIGIN");
    expect(workflow).toContain("npm run cloudflare:dns");
    expect(workflow).toContain("npm run cloudflare:apply");
    expect(workflow).toContain("npm run cloudflare:diagnose");
    expect(workflow).toContain("npm run cloudflare:apply-worker");
    expect(workflow).toContain("sleep 30");
    expect(workflow).toContain("npm run cloudflare:verify");
    expect(pkg).toContain('"cloudflare:apply"');
    expect(pkg).toContain('"cloudflare:dns"');
    expect(pkg).toContain('"cloudflare:diagnose"');
    expect(pkg).toContain('"cloudflare:apply-worker"');
    expect(pkg).toContain('"cloudflare:verify"');
    expect(diagnose).toContain("dns_records?name=");
    expect(diagnose).toContain("proxied");
    expect(diagnose).toContain("http_response_headers_transform");
    expect(dns).toContain("LOVABLE_PROXY_ORIGIN");
    expect(dns).toContain("185.158.133.1");
    expect(dns).toContain("proxied: true");
    expect(dns).toContain("evaluateWwwDnsState");
    expect(worker).toContain("quantivis-enterprise-security-headers");
    expect(worker).toContain("https://${HOSTNAME}/*");
    expect(worker).toContain("workers/scripts");
    expect(worker).toContain("workers/routes");
    expect(worker).toContain("Content-Security-Policy");
    expect(worker).toContain("X-Quantivis-Edge-Security");
    expect(worker).toContain("withSecurityHeaders");
    expect(worker).toContain("shouldStripBody");
    expect(worker).toContain("X-Quantivis-Edge-Security-Error");
    expect(worker).toContain("X-Quantivis-Edge-Path");
    expect(worker).toContain("Account / Workers Scripts / Edit");
    expect(worker).toContain("Zone / Workers Routes / Edit");
    expect(docs).toContain("Rollback plan");
    expect(docs).toContain("Least-privilege");
    expect(docs).toContain("LOVABLE_PROXY_ORIGIN");
    expect(docs).toContain("cloudflare:dns");
    expect(evidence).toContain("Cloudflare enterprise response headers");
    expect(evidence).toContain("npm run cloudflare:verify");
  });

  it("uses the current Cloudflare Rulesets header object schema", async () => {
    const moduleUrl = pathToFileURL(
      resolve(root, "scripts/apply-cloudflare-security.mjs"),
    ).href;
    const {
      buildCloudflareHeaderRule,
      buildCreateRulesetPayload,
      buildEntrypointRulesetPayload,
      managedHeaders,
      validateAppliedRuleset,
    } = await import(
      /* @vite-ignore */ moduleUrl
    );
    const rule = buildCloudflareHeaderRule();
    const payload = buildEntrypointRulesetPayload(null, [rule]);
    const createPayload = buildCreateRulesetPayload([rule]);

    expect(Array.isArray(managedHeaders)).toBe(false);
    expect(Array.isArray(rule.action_parameters.headers)).toBe(false);
    expect(rule.action_parameters.headers["Content-Security-Policy"]).toMatchObject({
      operation: "set",
    });
    expect(rule.action_parameters.headers["X-Frame-Options"]).toEqual({
      operation: "set",
      value: "DENY",
    });
    expect(rule.expression).toContain("/~oauth/");
    expect(payload).not.toHaveProperty("kind");
    expect(payload).not.toHaveProperty("phase");
    expect(payload.rules).toEqual([rule]);
    expect(createPayload).toHaveProperty("kind", "zone");
    expect(createPayload).toHaveProperty("phase", "http_response_headers_transform");
    expect(createPayload.rules).toEqual([rule]);

    const sanitizedPayload = buildEntrypointRulesetPayload(
      { name: "default", description: "Existing ruleset", kind: "zone", phase: "http_response_headers_transform" },
      [
        {
          ...rule,
          id: "cloudflare-generated-rule-id",
          kind: "zone",
          phase: "http_response_headers_transform",
          version: "1",
          last_updated: "2026-06-27T00:00:00Z",
        },
      ],
    );

    expect(JSON.stringify(sanitizedPayload)).not.toContain('"kind"');
    expect(JSON.stringify(sanitizedPayload)).not.toContain('"phase"');
    expect(JSON.stringify(sanitizedPayload)).not.toContain('"id"');
    expect(JSON.stringify(sanitizedPayload)).not.toContain('"version"');
    expect(JSON.stringify(sanitizedPayload)).not.toContain('"last_updated"');
    expect(() =>
      validateAppliedRuleset({
        id: "ruleset-id",
        rules: [
          {
            ...rule,
            id: "managed-rule-id",
            action_parameters: { headers: managedHeaders },
          },
        ],
      }),
    ).not.toThrow();
    expect(() => validateAppliedRuleset({ id: "ruleset-id", rules: [] })).toThrow(
      "Managed rule",
    );
  });

  it("guards Cloudflare DNS against Lovable direct A-record bypass", async () => {
    const moduleUrl = pathToFileURL(
      resolve(root, "scripts/apply-cloudflare-dns.mjs"),
    ).href;
    const { evaluateWwwDnsState } = await import(
      /* @vite-ignore */ moduleUrl
    );

    expect(
      evaluateWwwDnsState(
        [
          {
            type: "A",
            name: "www.quantivis.io",
            content: "185.158.133.1",
            proxied: false,
          },
        ],
        "",
      ),
    ).toMatchObject({
      ok: false,
      action: "missing-origin",
    });

    expect(
      evaluateWwwDnsState(
        [
          {
            type: "A",
            name: "www.quantivis.io",
            content: "185.158.133.1",
            proxied: false,
          },
        ],
        "quantivis-project.custom.lovable.app",
      ),
    ).toMatchObject({
      ok: false,
      action: "upsert-cname",
    });

    expect(
      evaluateWwwDnsState(
        [
          {
            type: "CNAME",
            name: "www.quantivis.io",
            content: "quantivis-project.custom.lovable.app",
            proxied: true,
          },
        ],
        "https://quantivis-project.custom.lovable.app/",
      ),
    ).toMatchObject({
      ok: true,
      action: "noop",
    });
  });

});
