import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("deploy-preview build target", () => {
  it("embeds the staging Supabase project in a real Netlify deploy-preview build", () => {
    const outDir = mkdtempSync(join(tmpdir(), "quantivis-deploy-preview-"));
    tempDirs.push(outDir);

    execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), "node_modules/vite/bin/vite.js"),
        "build",
        "--outDir",
        outDir,
        "--emptyOutDir",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CONTEXT: "deploy-preview",
          VERCEL_ENV: "",
          VITE_SUPABASE_URL: "",
          VITE_SUPABASE_PUBLISHABLE_KEY: "",
        },
        stdio: "pipe",
      },
    );

    const release = JSON.parse(
      readFileSync(join(outDir, "release.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(release.buildMode).toBe("production");
    expect(release.deploymentContext).toBe("deploy-preview");
    expect(release.supabaseProjectRef).toBe("cmnihsbdbpubznlkmjbc");
    expect(release.supabaseProjectRef).not.toBe("izgfrekdamlgigehxoqs");
    expect(release.supabaseProjectRef).not.toBe("itpwpnwzzitkelffttyx");
  }, 120_000);
});
