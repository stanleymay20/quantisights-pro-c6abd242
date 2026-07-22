import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Auth: unexpected session loss is no longer silent (audit: 50-min token-refresh failure with no warning)", () => {
  // A live audit found the Supabase auth client repeatedly failing to
  // refresh its access token for over 50 minutes, eventually resolving
  // into a silent logout with no warning banner and all navigation state
  // lost -- the user only discovered the cause by reading the console.
  // Investigated whether the @supabase/supabase-js version bumped earlier
  // this session (2.97.0 -> 2.110.3, to fix the Navigator LockManager
  // crash) could be implicated: "TypeError: Failed to fetch" is a raw
  // transport-layer failure, not something the auth coordination-layer
  // change (locks vs lockless) would cause -- both versions hit the same
  // underlying fetch() call and would fail the same way against an
  // unreachable/interrupted network. Root-causing the actual network
  // interruption needs live reproduction outside this environment. What's
  // fixable here regardless of root cause: telling the user their session
  // ended instead of silently clearing state.
  const source = read("src/contexts/AuthContext.tsx");

  it("shows a toast when SIGNED_OUT fires without the user having clicked Sign Out", () => {
    expect(source).toContain('_event === "SIGNED_OUT" && !deliberateSignOutRef.current');
    expect(source).toContain("Your session ended");
  });

  it("the Sign Out button suppresses the notice for a deliberate sign-out", () => {
    expect(source).toMatch(/const signOut = async \(\) => \{\s*\n\s*deliberateSignOutRef\.current = true;/);
  });
});
