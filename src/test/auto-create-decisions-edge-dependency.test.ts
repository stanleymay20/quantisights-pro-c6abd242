import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const functionDir = resolve(process.cwd(), "supabase/functions/auto-create-decisions");
const source = readFileSync(resolve(functionDir, "index.ts"), "utf8");
const config = JSON.parse(readFileSync(resolve(functionDir, "deno.json"), "utf8")) as {
  imports?: Record<string, string>;
};

const legacySpecifier = "https://esm.sh/@supabase/supabase-js@2";
const pinnedSpecifier = "npm:@supabase/supabase-js@2.57.2";

describe("auto-create-decisions Edge dependency pin", () => {
  it("maps the function's Supabase client import to the repository's known-good npm pin", () => {
    expect(source).toContain(`from "${legacySpecifier}"`);
    expect(config.imports?.[legacySpecifier]).toBe(pinnedSpecifier);
  });

  it("does not resolve the Supabase client through a floating esm.sh dependency", () => {
    const resolved = config.imports?.[legacySpecifier];
    expect(resolved).toMatch(/^npm:@supabase\/supabase-js@\d+\.\d+\.\d+$/);
    expect(resolved).not.toContain("esm.sh");
  });
});
