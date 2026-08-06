import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Demo: provisioning no longer races the unexpected-signout toast", () => {
  // A live audit observed /demo simultaneously showing a "Your session
  // ended / Please sign in again" toast alongside the Acme Corp
  // provisioning card. Root cause: Demo.tsx called
  // supabase.auth.signOut() directly instead of AuthContext's signOut()
  // wrapper, so the SIGNED_OUT event it produced looked "unexpected" to
  // the global listener in src/contexts/AuthContext.tsx (see
  // auth-unexpected-signout-notice.test.ts), which fires that toast for
  // any SIGNED_OUT event not flagged deliberate.
  const source = read("src/pages/Demo.tsx");

  it("uses AuthContext's signOut() so the sign-out is marked deliberate", () => {
    expect(source).toContain('import { useAuth } from "@/contexts/AuthContext"');
    expect(source).toContain("const { signOut } = useAuth();");
    expect(source).not.toMatch(/await supabase\.auth\.signOut\(\)/);
  });
});
