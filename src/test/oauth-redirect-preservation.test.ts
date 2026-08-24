import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const googleWorkflow = readSource(".github/workflows/configure-google-oauth.yml");
const app = readSource("src/App.tsx");
const publicPageNav = readSource("src/components/layout/PublicPageNav.tsx");

describe("OAuth redirect preservation", () => {
  it("allows staging OAuth to return from stable, commit-preview, and published Lovable hosts", () => {
    expect(googleWorkflow).toContain(
      "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app/**",
    );
    expect(googleWorkflow).toContain(
      "https://**--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app/**",
    );
    expect(googleWorkflow).toContain("https://quantivis-insights.lovable.app/**");
  });

  it("keeps authenticated users inside the protected application when they reach root", () => {
    expect(app).toContain("const AuthenticatedHomeRedirect");
    expect(app).toContain('if (user) return <Navigate to="/dashboard" replace />;');
    expect(app).toContain('path === "/"');
    expect(app).toContain("<AuthenticatedHomeRedirect>{entitledElement}</AuthenticatedHomeRedirect>");
  });

  it("does not render public navigation during the PKCE callback handoff", () => {
    expect(publicPageNav).toContain('location.pathname === "/auth/callback"');
    expect(publicPageNav).toContain("return null");
  });
});
