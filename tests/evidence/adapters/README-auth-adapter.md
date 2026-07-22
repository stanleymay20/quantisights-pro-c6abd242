# Authentication Evidence Adapter (EE-1B)

The `authentication` pipeline (see `tests/evidence/pipelines/authentication.mjs`)
is an **evidence consumer**. It does not launch Playwright or a browser; it
reads a JSON file produced by an execution adapter and folds each control
result into the standard evidence artifact schema.

This directory ships the reference adapter,
`tests/evidence/adapters/auth-adapter.mjs`, which is a **pure translator**
from Playwright's JSON reporter output into the AUTH evidence contract.

## End-to-end flow

```text
e2e/auth.spec.ts
   │  (Playwright — JSON reporter)
   ▼
/tmp/auth-play.json
   │  (auth-adapter.mjs — pure translator, no browser)
   ▼
/tmp/auth-evidence.json  ← EVIDENCE_AUTH_RESULTS
   │  (tests/evidence/pipelines/authentication.mjs)
   ▼
audit-artifacts/<date>/authentication/evidence.json
```

## 1. Run Playwright with the JSON reporter

```sh
npx playwright test e2e/auth.spec.ts --reporter=json > /tmp/auth-play.json
```

Playwright writes the report to stdout when `--reporter=json` is used without
an output file; redirect it to a stable path.

## 2. Translate to AUTH evidence

```sh
node tests/evidence/adapters/auth-adapter.mjs \
  --input  /tmp/auth-play.json \
  --output /tmp/auth-evidence.json \
  --strict
```

Flags:

| Flag           | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `--input, -i`  | Path to Playwright JSON reporter output (required).                    |
| `--output, -o` | Path to write the AUTH evidence JSON (required).                       |
| `--strict`     | Exit non-zero if a required AUTH-\* control is missing or a Playwright test cannot be mapped. |

Exit codes:

- `0` — translation succeeded (in `--strict`, every required control is mapped).
- `1` — malformed Playwright JSON, unmapped test (strict), missing required
  control (strict), or IO error.

## 3. Feed the pipeline

```sh
EVIDENCE_ENV=preview \
EVIDENCE_AUTH_RESULTS=/tmp/auth-evidence.json \
  npm run evidence:run -- authentication
```

Or run the full release gate (all pipelines + certification):

```sh
EVIDENCE_ENV=staging \
EVIDENCE_AUTH_RESULTS=/tmp/auth-evidence.json \
  npm run evidence:release
```

## Mapping strategy

The adapter maps each Playwright test to zero or more AUTH controls using, in
priority order:

1. **Explicit annotations** — the preferred, drift-resistant path. Add an
   annotation to the test:

   ```ts
   test("logout clears session", {
     annotation: [{ type: "auth-control", description: "AUTH-002" }],
   }, async ({ page }) => { /* … */ });
   ```

   Any annotation whose `description` contains an `AUTH-\d{3}` code is
   picked up; a single test may cover multiple controls.

2. **Title substring match** — for the tests currently in
   `e2e/auth.spec.ts` (see `TITLE_MAP` in the adapter). Renames break this
   fallback on purpose; prefer annotations for new tests.

3. **Unmatched** — the test is recorded as unmapped. In `--strict` this is a
   hard error; otherwise it becomes a warning and the corresponding AUTH-\*
   control is reported as missing.

If two tests map to the same control, the worst status wins
(`FAIL > SKIP > PASS`), so a broken variant of the same control still blocks
certification.

## Adapter contract (output schema)

```jsonc
{
  "adapter": "playwright",
  "collected_at": "2026-07-01T00:00:00.000Z",
  "environment": "preview",
  "source": {
    "playwright_version": "1.59.1",
    "spec": "e2e/auth.spec.ts"
  },
  "controls": {
    "AUTH-001": {
      "status": "PASS",              // PASS | FAIL | SKIP
      "execution_time_ms": 1240,
      "evidence": {
        "route": null,
        "response_status": null,
        "redirect_chain": [],
        "session_state": null,
        "auth_state": null,
        "console_errors": [],
        "network_failures": [],
        "screenshots": ["artifacts/auth-001-login.png"],
        "playwright": {
          "test_title": "e2e/auth.spec.ts > Authentication Flow > login with invalid credentials shows error",
          "project": "chromium",
          "retries": 0
        }
      },
      "error": null                   // populated when status = FAIL
    }
    // … AUTH-002 … AUTH-015
  }
}
```

The adapter emits `null`/`[]` for evidence fields Playwright cannot supply
natively (session state, redirect chain, console/network capture). Future
Playwright specs should populate those fields via annotations or attached
fixtures; the adapter passes any additional fields through untouched when
present.

## Control catalogue

The 15 controls are declared in
`tests/evidence/pipelines/lib/auth-controls.mjs`. Each control defines its
expected outcome, failure condition, blocking severity, semantic failure
code, and remediation recommendation. The pipeline refuses to certify if any
required control is missing (STATUS = `FRAMEWORK_INVALID`) or any critical
control fails (STATUS = `SECURITY_FAILURE`, hard-blocking).

## Control coverage (EE-1C)

Every test in `e2e/auth.spec.ts` calls `attachAuthEvidence(page, testInfo, "AUTH-###")`
(see `e2e/lib/auth-evidence.ts`), which:

- Adds the `auth-control` annotation the adapter maps on.
- Captures console errors, network failures (status ≥ 400), redirect chain,
  and last response status.
- Reads the Supabase session from `localStorage` on request.
- Attaches an `auth-evidence` JSON sidecar the adapter merges into the
  control's `evidence` object.

| Control  | Coverage in `e2e/auth.spec.ts`                          | Fixture required                                                 |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| AUTH-001 | Invalid credentials show error                           | none                                                             |
| AUTH-002 | signOut clears session and redirects to /login           | `EVIDENCE_STAGING_EMAIL`, `EVIDENCE_STAGING_PASSWORD`            |
| AUTH-003 | Google OAuth button visible on /login                    | none                                                             |
| AUTH-004 | /auth/callback with no code degrades gracefully          | none (full PKCE round-trip requires staging OAuth)               |
| AUTH-005 | Session persists across reload                           | staging creds                                                    |
| AUTH-006 | `refreshSession()` returns fresh token                   | staging creds                                                    |
| AUTH-007 | Manually expired token routes to /login without crash    | staging creds                                                    |
| AUTH-008 | Corrupt `sb-*` token is purged; user recovers            | none                                                             |
| AUTH-009 | Unauthenticated `/dashboard` redirects to /login         | none                                                             |
| AUTH-010 | MFA challenge enforced on login                          | staging creds + `EVIDENCE_MFA_EMAIL`, `EVIDENCE_MFA_TOTP_SECRET` |
| AUTH-011 | Forgot-password page submits reset request               | none                                                             |
| AUTH-012 | Password reset completion via recovery link              | mail-catcher (`EVIDENCE_MAIL_CATCHER_URL`)                       |
| AUTH-013 | Recovery round-trip: new password succeeds               | staging creds + mail-catcher                                     |
| AUTH-014 | Login page hydrates without noisy console errors         | none                                                             |
| AUTH-015 | signOut removes every `sb-*` localStorage key            | staging creds                                                    |

Tests without their required fixture are `test.skip()` at runtime, which
Playwright reports as `skipped`. The adapter maps `skipped` → `SKIP`, which
the pipeline records as a warning-tier `CONTROL_SKIPPED` — never a fake
PASS. If a required control has no matching Playwright result at all, the
pipeline emits `FRAMEWORK_INVALID`.

### Fixture bundles

- **Staging creds** — a seeded, non-MFA user in the target environment.
- **MFA fixture** — a seeded user with TOTP enrolled; `EVIDENCE_MFA_TOTP_SECRET`
  is the base32 seed the harness can turn into codes.
- **Mail-catcher** — an inbox reachable at `EVIDENCE_MAIL_CATCHER_URL` (e.g.
  Mailpit) that the harness can poll for the recovery link.

## Remaining blockers before real staging run

1. **Staging user + MFA fixture** — provision `EVIDENCE_STAGING_EMAIL/PASSWORD`
   and `EVIDENCE_MFA_EMAIL/TOTP_SECRET`; today AUTH-002, 005, 006, 007, 010,
   and 015 skip without them.
2. **Mail-catcher endpoint** — required for AUTH-012 and the AUTH-013
   round-trip; the current tests short-circuit with a note.
3. **PKCE end-to-end** — AUTH-004 today asserts only that the callback
   surface degrades gracefully without a code. Full PKCE requires staging
   Google OAuth credentials and a scripted consent flow.
4. **CI wiring** — chain `playwright test --reporter=json → auth-adapter →
   evidence:release` in the release workflow so the adapter output feeds the
   certification engine automatically.

