import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/contexts/AuthContext.tsx"), "utf8");

describe("OAuth auth hydration race", () => {
  it("buffers a real PKCE SIGNED_IN session while initial hydration is unresolved", () => {
    expect(source).toContain("let earlySignedInSession: Session | null = null");
    expect(source).toContain('if (_event === "SIGNED_IN" && nextSession?.user)');
    expect(source).toContain("earlySignedInSession = nextSession");
    expect(source).not.toContain("if (!initialSessionResolved || cancelled) return;");
  });

  it("validates the buffered OAuth session before committing authenticated state", () => {
    expect(source).toContain("let resolvedSession = earlySignedInSession ?? storedSession");
    expect(source).toContain("await validateSession(resolvedSession)");
    expect(source).toContain("supabase.auth.getUser(candidate.access_token)");
    expect(source).toContain("initialSessionResolved = true");
  });
});
