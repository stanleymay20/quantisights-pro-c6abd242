import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("backup authentication continuity", () => {
  it("adds a password to the authenticated identity instead of creating another account", () => {
    const component = read("src/components/auth/BackupPassword.tsx");

    expect(component).toContain("supabase.auth.getUser()");
    expect(component).toContain("supabase.auth.updateUser({ password })");
    expect(component).toContain("updatedUser.user.id !== currentUser.user.id");
    expect(component).not.toContain("supabase.auth.signUp");
    expect(component).not.toContain("admin.createUser");
    expect(component).not.toContain("from(\"profiles\").insert");
    expect(component).not.toContain("from(\"organization_members\").insert");
  });

  it("keeps credential material out of application persistence and logs", () => {
    const component = read("src/components/auth/BackupPassword.tsx");

    expect(component).not.toMatch(/console\.(log|info|warn|error)\([^\n]*password/i);
    expect(component).not.toMatch(/\.from\([^)]*\)\.(insert|upsert|update)\([^\n]*password/i);
    expect(component).toContain("Quantivis never stores the password in application tables or logs");
  });

  it("requires a strong confirmed credential and exposes the control from Security settings", () => {
    const component = read("src/components/auth/BackupPassword.tsx");
    const posture = read("src/components/security/SecurityPosture.tsx");

    expect(component).toContain("const MIN_PASSWORD_LENGTH = 12");
    expect(component).toContain("password !== confirmPassword");
    expect(component).toContain("Set or rotate backup password");
    expect(component).toContain("does not create another account");
    expect(posture).toContain('import BackupPassword from "@/components/auth/BackupPassword"');
    expect(posture).toContain("<BackupPassword />");
  });
});
