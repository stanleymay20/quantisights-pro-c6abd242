// e2e/lib/auth-evidence.ts
// Sidecar evidence collector for the EE-1B Playwright → AUTH adapter.
//
// Usage inside a test:
//
//   test("logout clears session", async ({ page }, testInfo) => {
//     const ev = attachAuthEvidence(page, testInfo, "AUTH-002");
//     await page.goto("/dashboard");
//     ev.mark({ route: "/dashboard" });
//     // …
//     await ev.finalize();
//   });
//
// The helper:
//   - Adds the `auth-control` annotation the adapter looks for.
//   - Tracks console errors, network failures, redirect chain, last response
//     status, and any session_state / auth_state the test explicitly reports.
//   - Writes a JSON attachment (`name: "auth-evidence"`,
//     `contentType: "application/json"`) that the adapter merges into the
//     control's `evidence` object.

import type { Page, TestInfo, Response } from "@playwright/test";

export interface AuthEvidenceSidecar {
  route: string | null;
  response_status: number | null;
  redirect_chain: string[];
  session_state: Record<string, unknown> | null;
  auth_state: string | null;
  console_errors: Array<{ message: string; location?: string }>;
  network_failures: Array<{ url: string; status: number; method: string }>;
  notes: string[];
}

export interface AuthEvidenceHandle {
  sidecar: AuthEvidenceSidecar;
  mark: (partial: Partial<AuthEvidenceSidecar>) => void;
  note: (msg: string) => void;
  setSession: (state: Record<string, unknown> | null, authState?: string) => void;
  finalize: () => Promise<void>;
}

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[HMR\]/i,
];

export function attachAuthEvidence(page: Page, testInfo: TestInfo, controlId: string): AuthEvidenceHandle {
  testInfo.annotations.push({ type: "auth-control", description: controlId });

  const sidecar: AuthEvidenceSidecar = {
    route: null,
    response_status: null,
    redirect_chain: [],
    session_state: null,
    auth_state: null,
    console_errors: [],
    network_failures: [],
    notes: [],
  };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((rx) => rx.test(text))) return;
    const loc = msg.location();
    sidecar.console_errors.push({
      message: text,
      location: loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
    });
  });

  page.on("pageerror", (err) => {
    sidecar.console_errors.push({ message: `pageerror: ${err.message}` });
  });

  page.on("response", (res: Response) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400) {
      sidecar.network_failures.push({ url, status, method: res.request().method() });
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      sidecar.redirect_chain.push(frame.url());
    }
  });

  page.on("request", () => {
    // no-op; kept for future extension
  });

  const handle: AuthEvidenceHandle = {
    sidecar,
    mark(partial) {
      Object.assign(sidecar, partial);
    },
    note(msg) {
      sidecar.notes.push(msg);
    },
    setSession(state, authState) {
      sidecar.session_state = state;
      if (authState) sidecar.auth_state = authState;
    },
    async finalize() {
      sidecar.route = sidecar.route ?? new URL(page.url()).pathname;
      await testInfo.attach("auth-evidence", {
        body: JSON.stringify(sidecar, null, 2),
        contentType: "application/json",
      });
    },
  };

  return handle;
}

/**
 * Read the current Supabase session from localStorage (best-effort, non-
 * destructive). Returns { user_id, aal } or null.
 */
export async function readSupabaseSession(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (!/^sb-.*-auth-token$/.test(key)) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const user = parsed?.user ?? parsed?.currentSession?.user ?? null;
        return {
          user_id: user?.id ?? null,
          aal: parsed?.aal ?? parsed?.currentSession?.aal ?? null,
          expires_at: parsed?.expires_at ?? parsed?.currentSession?.expires_at ?? null,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  });
}

/**
 * True when staging-tier auth fixtures are present. Used to gate tests that
 * need a real signed-in session, a mail-catcher, or MFA enrollment. Absent
 * fixtures produce `test.skip()` (adapter → SKIP → pipeline WARNING), never a
 * fake PASS.
 */
export function stagingAuthAvailable(): { ok: boolean; missing: string[] } {
  const required = ["EVIDENCE_STAGING_EMAIL", "EVIDENCE_STAGING_PASSWORD"];
  const missing = required.filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

export function mailCatcherAvailable(): boolean {
  return !!process.env.EVIDENCE_MAIL_CATCHER_URL;
}

export function mfaFixtureAvailable(): boolean {
  return !!process.env.EVIDENCE_MFA_TOTP_SECRET && !!process.env.EVIDENCE_MFA_EMAIL;
}
