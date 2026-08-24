import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  attachAuthEvidence,
  readSupabaseSession,
} from "./lib/auth-evidence";

interface AcceptanceFixture {
  tier?: string;
  user_id?: string;
  email: string;
  password: string;
  org_id?: string;
}

interface StoredAuth {
  key: string;
  access_token: string | null;
  refresh_token: string | null;
}

const statePath = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";

function fixtureFor(tier = "starter"): AcceptanceFixture | null {
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      const fixture = state?.customers?.[tier];
      if (fixture?.email && fixture?.password) return fixture;
    } catch {
      // Fall through to explicit evidence credentials.
    }
  }

  if (tier === "starter" && process.env.EVIDENCE_STAGING_EMAIL && process.env.EVIDENCE_STAGING_PASSWORD) {
    return {
      email: process.env.EVIDENCE_STAGING_EMAIL,
      password: process.env.EVIDENCE_STAGING_PASSWORD,
      org_id: process.env.EVIDENCE_STAGING_ORG_ID,
    };
  }

  return null;
}

function adminClient() {
  const url = process.env.LOAD_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function strongTestPassword() {
  return `${randomBytes(18).toString("base64url")}!Aa7`;
}

async function generateRecoveryLink(
  fixture: AcceptanceFixture,
  redirectTo: string,
) {
  const admin = adminClient();
  if (!admin) throw new Error("Supabase staging admin client is required");

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: fixture.email,
    options: { redirectTo },
  });
  if (error) throw error;

  const actionLink = data?.properties?.action_link;
  if (!actionLink) throw new Error("Supabase did not return a recovery action link");
  return { admin, actionLink };
}

async function completeRecoveryInBrowser(page: Page, actionLink: string, password: string) {
  await page.goto(actionLink);
  await page.waitForURL(/\/reset-password(?:[?#]|$)/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();
  await page.getByLabel(/new password/i).fill(password);
  await page.getByLabel(/confirm password/i).fill(password);
  await page.getByRole("button", { name: /update password/i }).click();
  await page.waitForURL(/\/login(?:[?#]|$)/, { timeout: 15_000 });
}

async function signIn(page: Page, fixture: AcceptanceFixture) {
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(fixture.email);
  await page.getByLabel(/password/i).first().fill(fixture.password);
  await page.getByRole("button", { name: /sign in securely|sign in|log in/i }).first().click();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 15_000 });
}

async function storedAuth(page: Page): Promise<StoredAuth | null> {
  return page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        return {
          key,
          access_token: parsed?.access_token ?? parsed?.currentSession?.access_token ?? null,
          refresh_token: parsed?.refresh_token ?? parsed?.currentSession?.refresh_token ?? null,
        };
      } catch {
        return null;
      }
    }
    return null;
  });
}

async function mutateStoredAuth(
  page: Page,
  mutation: "expire" | "corrupt",
): Promise<boolean> {
  return page.evaluate((kind) => {
    for (const key of Object.keys(window.localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (kind === "expire") {
          parsed.expires_at = 1;
          parsed.refresh_token = "invalid-expired-refresh-token";
          if (parsed.currentSession) {
            parsed.currentSession.expires_at = 1;
            parsed.currentSession.refresh_token = "invalid-expired-refresh-token";
          }
        } else {
          parsed.access_token = "bad_jwt";
          parsed.refresh_token = "bad_refresh";
          parsed.expires_at = Math.floor(Date.now() / 1000) + 3600;
          if (parsed.currentSession) {
            parsed.currentSession.access_token = "bad_jwt";
            parsed.currentSession.refresh_token = "bad_refresh";
            parsed.currentSession.expires_at = Math.floor(Date.now() / 1000) + 3600;
          }
        }
        window.localStorage.setItem(key, JSON.stringify(parsed));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, mutation);
}

const starter = fixtureFor("starter");
const enterprise = fixtureFor("enterprise") ?? starter;

test.describe("Authentication Flow", () => {
  // ------------------------------------------------------------ AUTH-001
  test("AUTH-001 valid email/password credentials establish a session", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-001");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    const session = await readSupabaseSession(page);
    expect(session?.user_id).toBeTruthy();
    expect(new URL(page.url()).pathname).not.toBe("/login");
    ev.mark({ route: new URL(page.url()).pathname });
    ev.setSession(session, "signed_in");
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-002
  test("AUTH-002 signOut clears session and redirects to /login", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-002");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    expect(await readSupabaseSession(page)).not.toBeNull();
    await page.getByRole("button", { name: /log ?out|sign ?out/i }).first().click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    const session = await readSupabaseSession(page);
    expect(session).toBeNull();
    ev.setSession(session, "signed_out");
    ev.mark({ route: "/login" });
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-003
  test("AUTH-003 Google OAuth button initiates the OAuth broker flow", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-003");
    await page.goto("/login");
    const googleButton = page.getByRole("button", { name: /google/i }).first();
    await expect(googleButton).toBeVisible();

    const oauthRequest = page.waitForRequest(
      (request) => /oauth|google/i.test(request.url()) && !/googleapis\.com\/.*(?:font|icon)/i.test(request.url()),
      { timeout: 15_000 },
    );
    await googleButton.click();
    const request = await oauthRequest;
    const url = new URL(request.url());
    ev.note(`OAuth initiation host=${url.host} path=${url.pathname}`);
    expect(request.url()).toMatch(/oauth|google/i);
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-004
  test("AUTH-004 PKCE callback exchanges a real one-time authorization code", async ({ page }, testInfo) => {
    attachAuthEvidence(page, testInfo, "AUTH-004");
    test.skip(true, "real one-time PKCE authorization-code fixture is not wired yet; do not fake PASS with a no-code callback");
  });

  // ------------------------------------------------------------ AUTH-005
  test("AUTH-005 session persists across reload", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-005");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    const before = await readSupabaseSession(page);
    expect(before?.user_id).toBeTruthy();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const after = await readSupabaseSession(page);
    expect(after?.user_id).toBe(before?.user_id);
    expect(new URL(page.url()).pathname).not.toBe("/login");
    ev.setSession(after, "signed_in");
    ev.mark({ route: new URL(page.url()).pathname });
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-006
  test("AUTH-006 refresh token grant returns a fresh authenticated session", async ({ page, request }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-006");
    const supabaseUrl = process.env.LOAD_SUPABASE_URL;
    const anonKey = process.env.LOAD_SUPABASE_ANON_KEY;
    test.skip(!starter || !supabaseUrl || !anonKey, "staging credentials, Supabase URL and anon key are required");

    await signIn(page, starter!);
    const stored = await storedAuth(page);
    expect(stored?.refresh_token).toBeTruthy();

    const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      data: { refresh_token: stored!.refresh_token },
    });
    ev.mark({ response_status: response.status() });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    ev.note("Refresh grant returned access_token + rotated refresh_token; token values intentionally not attached.");
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-007
  test("AUTH-007 expired session fails closed to /login without crashing", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-007");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    expect(await mutateStoredAuth(page, "expire")).toBeTruthy();
    await page.reload();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(await readSupabaseSession(page)).toBeNull();
    ev.mark({ route: "/login" });
    ev.setSession(null, "signed_out");
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-008
  test("AUTH-008 corrupt project auth token is purged and recovers to /login", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-008");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    expect(await mutateStoredAuth(page, "corrupt")).toBeTruthy();
    await page.reload();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const remaining = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.startsWith("sb-")),
    );
    expect(remaining).toEqual([]);
    ev.note("Corrupt real project auth storage was removed; token values intentionally not attached.");
    ev.mark({ route: "/login" });
    ev.setSession(null, "signed_out");
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-009
  test("AUTH-009 unauthenticated user is redirected from protected routes", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-009");
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    ev.mark({ route: "/login" });
    ev.setSession(null, "signed_out");
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-010
  test("AUTH-010 require_mfa organisation policy gates dashboard before enrollment", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-010");
    const admin = adminClient();
    test.skip(!enterprise?.org_id || !admin, "disposable staging enterprise org + service role are required");

    const { error: enableError } = await admin!
      .from("organizations")
      .update({ require_mfa: true })
      .eq("id", enterprise!.org_id!);
    expect(enableError).toBeNull();

    try {
      await signIn(page, enterprise!);
      await expect(page.getByText(/multi-factor authentication required/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /set up 2fa/i }).first()).toBeVisible();
      ev.mark({ route: new URL(page.url()).pathname });
      ev.setSession(await readSupabaseSession(page), "mfa_enrollment_required");
      await ev.finalize();
    } finally {
      const { error: restoreError } = await admin!
        .from("organizations")
        .update({ require_mfa: false })
        .eq("id", enterprise!.org_id!);
      expect(restoreError).toBeNull();
    }
  });

  // ------------------------------------------------------------ AUTH-011
  test("AUTH-011 password reset request is accepted and recovery email is enqueued", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-011");
    const admin = adminClient();
    test.skip(!starter || !admin, "disposable staging user + service role are required");

    const { count: beforeCount, error: beforeError } = await admin!
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("recipient_email", starter!.email)
      .eq("template_name", "recovery");
    expect(beforeError).toBeNull();

    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).first().fill(starter!.email);
    const recoverResponse = page.waitForResponse(
      (response) => response.url().includes("/auth/v1/recover") && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: /send|reset/i }).first().click();
    const response = await recoverResponse;
    const responseStatus = response.status();
    let responseCode = "unknown";
    let responseMessage = "";

    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          const payload = JSON.parse(responseText) as Record<string, unknown>;
          responseCode = String(payload.code ?? payload.error_code ?? payload.error ?? "unknown").slice(0, 80);
          responseMessage = String(payload.message ?? payload.msg ?? payload.error_description ?? "")
            .replaceAll(starter!.email, "[redacted-email]")
            .slice(0, 180);
        } catch {
          responseCode = "non_json_response";
        }
      }
    } catch {
      responseCode = "unreadable_response";
    }

    ev.mark({ route: "/forgot-password", response_status: responseStatus });
    ev.note(
      `Recovery endpoint status=${responseStatus} code=${responseCode}${responseMessage ? ` message=${responseMessage}` : ""}`,
    );

    try {
      expect(response.ok()).toBeTruthy();

      await expect.poll(async () => {
        const { count, error } = await admin!
          .from("email_send_log")
          .select("id", { count: "exact", head: true })
          .eq("recipient_email", starter!.email)
          .eq("template_name", "recovery");
        if (error) throw error;
        return count ?? 0;
      }, { timeout: 60_000 }).toBeGreaterThan(beforeCount ?? 0);

      ev.note("Recovery request returned 2xx and auth-email-hook created a recovery email_send_log row.");
    } finally {
      await ev.finalize();
    }
  });

  // ------------------------------------------------------------ AUTH-012
  test("AUTH-012 password reset completion follows a real one-time recovery link", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-012");
    test.skip(!starter || !adminClient(), "disposable staging user + service role are required");

    const originalPassword = starter!.password;
    const replacementPassword = strongTestPassword();
    const redirectTo = `${process.env.E2E_BASE_URL || "http://127.0.0.1:4173"}/reset-password`;
    const { admin, actionLink } = await generateRecoveryLink(starter!, redirectTo);

    try {
      await completeRecoveryInBrowser(page, actionLink, replacementPassword);
      await signIn(page, { ...starter!, password: replacementPassword });
      const session = await readSupabaseSession(page);
      expect(session?.user_id).toBe(starter!.user_id);
      ev.setSession(session, "recovered");

      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await page.context().clearCookies();
      await page.goto(actionLink);
      await expect(page.getByRole("heading", { name: /invalid reset link/i })).toBeVisible({ timeout: 15_000 });
      ev.note("A genuine admin-generated recovery link updated the password and could not be consumed twice.");
      ev.mark({ route: new URL(page.url()).pathname });
    } finally {
      if (starter!.user_id) {
        const { error } = await admin.auth.admin.updateUserById(starter!.user_id, { password: originalPassword });
        expect(error).toBeNull();
      }
      await ev.finalize();
    }
  });

  // ------------------------------------------------------------ AUTH-013
  test("AUTH-013 recovery round-trip proves new password succeeds and old password fails", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-013");
    test.skip(!starter || !adminClient(), "disposable staging user + service role are required");

    const oldPassword = starter!.password;
    const newPassword = strongTestPassword();
    const redirectTo = `${process.env.E2E_BASE_URL || "http://127.0.0.1:4173"}/reset-password`;
    const { actionLink } = await generateRecoveryLink(starter!, redirectTo);

    await completeRecoveryInBrowser(page, actionLink, newPassword);

    await page.goto("/login");
    await page.getByLabel(/email/i).first().fill(starter!.email);
    await page.getByLabel(/password/i).first().fill(oldPassword);
    await page.getByRole("button", { name: /sign in securely|sign in|log in/i }).first().click();
    await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
    await expect(page.getByText(/invalid login credentials/i).first()).toBeVisible({ timeout: 10_000 });

    await signIn(page, { ...starter!, password: newPassword });
    const session = await readSupabaseSession(page);
    expect(session?.user_id).toBe(starter!.user_id);
    starter!.password = newPassword;
    ev.setSession(session, "recovered_fresh_login");
    ev.note("Old credentials failed after recovery; a fresh login with the replacement password succeeded for the same user id.");
    ev.mark({ route: new URL(page.url()).pathname });
    await ev.finalize();
  });

  // ------------------------------------------------------------ AUTH-014
  test("AUTH-014 AuthContext hydrates login page without noisy errors", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-014");
    await page.goto("/login");
    ev.mark({ route: "/login" });
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in securely|sign in|log in/i }).first()).toBeVisible();
    await ev.finalize();
    expect(ev.sidecar.console_errors.length).toBeLessThanOrEqual(2);
  });

  // ------------------------------------------------------------ AUTH-015
  test("AUTH-015 logout clears Supabase and tenant browser state", async ({ page }, testInfo) => {
    const ev = attachAuthEvidence(page, testInfo, "AUTH-015");
    test.skip(!starter, "real disposable staging credentials are required");

    await signIn(page, starter!);
    await page.evaluate(() => {
      window.sessionStorage.setItem("quantivis_org_id", "sentinel-org");
      window.sessionStorage.setItem("quantivis_workspace_id", "sentinel-workspace");
      window.sessionStorage.setItem("quantivis_project_id", "sentinel-project");
    });
    await page.getByRole("button", { name: /log ?out|sign ?out/i }).first().click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    const remaining = await page.evaluate(() => ({
      supabase: Object.keys(window.localStorage).filter((key) => key.startsWith("sb-")),
      org: window.sessionStorage.getItem("quantivis_org_id"),
      workspace: window.sessionStorage.getItem("quantivis_workspace_id"),
      project: window.sessionStorage.getItem("quantivis_project_id"),
      pkce: window.sessionStorage.getItem("supabase-oauth-code-verifier"),
    }));
    expect(remaining.supabase).toEqual([]);
    expect(remaining.org).toBeNull();
    expect(remaining.workspace).toBeNull();
    expect(remaining.project).toBeNull();
    expect(remaining.pkce).toBeNull();
    ev.note("Supabase auth keys, tenant scope and PKCE verifier were cleared.");
    ev.mark({ route: "/login" });
    ev.setSession(null, "signed_out");
    await ev.finalize();
  });
});
