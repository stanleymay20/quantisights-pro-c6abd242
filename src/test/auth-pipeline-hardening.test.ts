import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const protectedRoute = readSource("src/components/auth/ProtectedRoute.tsx");
const mfaEnroll = readSource("src/components/auth/MFAEnroll.tsx");
const mfaChallenge = readSource("src/components/auth/MFAChallenge.tsx");
const authContext = readSource("src/contexts/AuthContext.tsx");
const sessionTimeout = readSource("src/components/auth/SessionTimeout.tsx");
const resetPassword = readSource("src/pages/ResetPassword.tsx");
const authEvidence = readSource("e2e/lib/auth-evidence.ts");
const login = readSource("src/pages/Login.tsx");

describe("authentication pipeline production safety", () => {
  it("fails closed when organization security policy or MFA factor reads fail", () => {
    expect(protectedRoute).toContain("error: orgSettingsError");
    expect(protectedRoute).toContain("if (orgSettingsError)");
    expect(protectedRoute).toContain("error: factorsError");
    expect(protectedRoute).toContain('setStatus("blocked")');
    expect(protectedRoute).toContain('mfaStatus === "blocked"');
  });

  it("re-evaluates the security gate after MFA verification or enrollment", () => {
    expect(protectedRoute).toContain("<MFAChallenge onVerified={retryMfaCheck} />");
    expect(protectedRoute).toContain("<MFAEnroll onStatusChange={retryMfaCheck} />");
  });

  it("treats Supabase factor errors as unknown instead of disabled", () => {
    expect(mfaEnroll).toContain("const { data, error } = await supabase.auth.mfa.listFactors()");
    expect(mfaEnroll).toContain("if (error) throw error");
    expect(mfaEnroll).toContain("if (unenrollError) throw unenrollError");
    expect(mfaChallenge).toContain("error: factorsError");
  });

  it("challenges a verified TOTP factor rather than an arbitrary first factor", () => {
    expect(mfaChallenge).toContain('.find((factor) => factor.status === "verified")');
    expect(mfaChallenge).not.toContain("factorsData?.totp?.[0]");
  });

  it("clears local credentials even if remote sign-out fails", () => {
    const signOutStart = authContext.indexOf("const signOut = async () => {");
    const finallyBlock = authContext.indexOf("} finally {", signOutStart);
    const clearStorage = authContext.indexOf("clearSupabaseAuthStorage();", finallyBlock);
    const clearUser = authContext.indexOf("setUser(null);", finallyBlock);

    expect(signOutStart).toBeGreaterThan(-1);
    expect(finallyBlock).toBeGreaterThan(signOutStart);
    expect(clearStorage).toBeGreaterThan(finallyBlock);
    expect(clearUser).toBeGreaterThan(clearStorage);
    expect(authContext).toContain('supabase.auth.signOut({ scope: "local" })');
  });

  it("uses organization session timeout policy instead of a fixed 30-minute timer", () => {
    expect(sessionTimeout).toContain('.rpc("get_my_org_security_settings")');
    expect(sessionTimeout).toContain("session_timeout_minutes");
    expect(sessionTimeout).toContain("SAFE_POLICY_ERROR_TIMEOUT_MINUTES = 15");
    expect(sessionTimeout).toContain("inactivityLimitMs - WARNING_BEFORE_MS");
    expect(sessionTimeout).not.toContain("const INACTIVITY_LIMIT_MS = 30 * 60 * 1000");
  });

  it("keeps reset-password strength aligned with registration and returns to fresh login", () => {
    expect(resetPassword).toContain("const MIN_PASSWORD_LENGTH = 12");
    expect(resetPassword).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(resetPassword).toContain('navigate("/login", { replace: true })');
    expect(resetPassword).toContain("isCheckingRecovery");
    expect(resetPassword).toContain('hash.get("type") === "recovery"');
    expect(resetPassword).toContain("supabase.auth.setSession({");
    expect(resetPassword).toContain("window.history.replaceState");
    expect(resetPassword).not.toContain('label: "At least 8 characters"');
  });

  it("removes credentials from recovery URLs and authentication evidence", () => {
    expect(resetPassword).toContain("window.history.replaceState");
    expect(authEvidence).toContain("sanitizedUrl(frame.url())");
    expect(authEvidence).toContain("`${url.origin}${url.pathname}`");
    expect(authEvidence).not.toContain("sidecar.redirect_chain.push(frame.url())");
  });

  it("does not downgrade an unavailable SSO policy to password login", () => {
    expect(login).toContain("const [ssoPolicyError, setSsoPolicyError]");
    expect(login).toContain("const { data, error } = await supabase.rpc(\"resolve_sso_for_email\"");
    expect(login).toContain("if (error) throw error");
    expect(login).toContain("if (ssoChecking || ssoPolicyError)");
    expect(login).toContain("Retry security check");
    expect(login).not.toContain("SSO lookup failure is non-blocking");
  });

  it("keeps post-login MFA enforcement in the protected route rather than the credential try/catch", () => {
    expect(login).not.toContain("supabase.auth.mfa.listFactors()");
    expect(login).not.toContain("setShowMFA(true)");
    expect(login).toContain("ProtectedRoute is the single authoritative MFA / organisation-policy gate");
  });
});
