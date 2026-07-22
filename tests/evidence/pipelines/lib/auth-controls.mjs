// tests/evidence/pipelines/lib/auth-controls.mjs
// Canonical control registry for the Authentication evidence pipeline.
//
// Each control is a contract between the execution adapter (Playwright, k6,
// or a manual reviewer) and the certification engine. The adapter produces a
// result JSON keyed by control_id; this module defines what the runner will
// accept.
//
// Fields:
//   control_id            stable identifier (used as JSON key)
//   control_name          human label rendered in reports
//   coverage              short description of what is exercised
//   expected_outcome      what a PASS observation looks like
//   failure_condition     what turns the observation into a failure
//   failure_code          taxonomy failure code recorded on the artifact
//                         (mapped to STATUS.SECURITY_FAILURE by default; the
//                          pipeline records the semantic code inside
//                          failures[].code, e.g. AUTH_FAILURE, PKCE_FAILURE)
//   blocking              "critical" (blocks release) | "warning" (non-blocking)
//   recommendation        remediation guidance surfaced on the certification report

export const AUTH_CONTROLS = Object.freeze([
  {
    control_id: "AUTH-001",
    control_name: "Email/password login",
    coverage: "POST /auth/v1/token grant_type=password with valid credentials",
    expected_outcome: "200 response with access_token and Supabase session hydrated on client",
    failure_condition: "non-2xx, missing access_token, or AuthContext.user null after signIn",
    failure_code: "AUTH_FAILURE",
    blocking: "critical",
    recommendation: "Verify Supabase email provider is enabled and seed user exists.",
  },
  {
    control_id: "AUTH-002",
    control_name: "Email/password logout",
    coverage: "supabase.auth.signOut() clears session and redirects to /login",
    expected_outcome: "AuthContext.user becomes null, /dashboard redirects to /login",
    failure_condition: "session persists after signOut or protected route remains reachable",
    failure_code: "SESSION_LEAK",
    blocking: "critical",
    recommendation: "Ensure signOut clears local + session storage and revokes refresh token.",
  },
  {
    control_id: "AUTH-003",
    control_name: "Google OAuth initiation",
    coverage: "lovable.auth.signInWithOAuth('google') returns provider redirect",
    expected_outcome: "Result.redirected === true OR authenticated session established via popup",
    failure_condition: "helper throws, redirect chain misses /~oauth, or session absent",
    failure_code: "OAUTH_FAILURE",
    blocking: "critical",
    recommendation: "Confirm Google provider is enabled in Cloud auth settings and redirect URIs registered.",
  },
  {
    control_id: "AUTH-004",
    control_name: "PKCE callback exchange",
    coverage: "GET /auth/callback?code=... completes single-shot code exchange",
    expected_outcome: "onAuthStateChange fires SIGNED_IN, callback redirects to safe next path",
    failure_condition: "double-exchange error, session never appears within 6s timeout",
    failure_code: "PKCE_FAILURE",
    blocking: "critical",
    recommendation: "Do not call exchangeCodeForSession manually; rely on detectSessionInUrl auto-exchange.",
  },
  {
    control_id: "AUTH-005",
    control_name: "Session persistence across reload",
    coverage: "Reload after login preserves session via localStorage",
    expected_outcome: "AuthContext hydrates user without redirect to /login",
    failure_condition: "post-reload user is null or /dashboard bounces to /login",
    failure_code: "SESSION_LOSS",
    blocking: "critical",
    recommendation: "Verify storage=localStorage and persistSession=true on Supabase client.",
  },
  {
    control_id: "AUTH-006",
    control_name: "Session refresh",
    coverage: "Access token expires and autoRefreshToken issues new token silently",
    expected_outcome: "Subsequent authenticated request returns 2xx with fresh JWT",
    failure_condition: "401 after expiry, refresh_token grant fails, or user forcibly signed out",
    failure_code: "REFRESH_FAILURE",
    blocking: "critical",
    recommendation: "Confirm refresh token rotation is enabled and clock skew < 30s.",
  },
  {
    control_id: "AUTH-007",
    control_name: "Expired session handling",
    coverage: "Manually expired token triggers graceful re-auth prompt",
    expected_outcome: "User is redirected to /login with no white-screen or unhandled error",
    failure_condition: "app crashes, infinite spinner, or session appears valid",
    failure_code: "EXPIRED_SESSION_UNHANDLED",
    blocking: "critical",
    recommendation: "Ensure ProtectedRoute fails closed and AuthContext resets on expiry.",
  },
  {
    control_id: "AUTH-008",
    control_name: "Invalid JWT recovery",
    coverage: "Stale/corrupt bad_jwt token is detected and purged",
    expected_outcome: "AuthContext clears storage, signs out locally, redirects to /login",
    failure_condition: "loop of 403 bad_jwt requests without recovery",
    failure_code: "BAD_JWT_LOOP",
    blocking: "critical",
    recommendation: "Keep isBadJwtError + clearSupabaseAuthStorage path in AuthContext.",
  },
  {
    control_id: "AUTH-009",
    control_name: "Protected route redirect",
    coverage: "Unauthenticated GET /dashboard redirects to /login",
    expected_outcome: "302/replace to /login, no protected data flashed",
    failure_condition: "protected route renders without session",
    failure_code: "AUTHZ_BYPASS",
    blocking: "critical",
    recommendation: "ProtectedRoute must fail closed on any auth-check error.",
  },
  {
    control_id: "AUTH-010",
    control_name: "MFA enforcement",
    coverage: "Org with require_mfa=true forces enroll or challenge before dashboard",
    expected_outcome: "MFAEnroll or MFAChallenge component renders; app routes gated",
    failure_condition: "user reaches /dashboard without aal2 when org requires MFA",
    failure_code: "MFA_BYPASS",
    blocking: "critical",
    recommendation: "Verify get_my_org_security_settings + mfa.getAuthenticatorAssuranceLevel.",
  },
  {
    control_id: "AUTH-011",
    control_name: "Password reset request",
    coverage: "supabase.auth.resetPasswordForEmail with redirect to /reset-password",
    expected_outcome: "200 response, reset email enqueued via auth-email-hook",
    failure_condition: "non-2xx, missing redirectTo, or no email row in outbox",
    failure_code: "RESET_REQUEST_FAILURE",
    blocking: "critical",
    recommendation: "Confirm auth-email-hook is deployed and email domain verified.",
  },
  {
    control_id: "AUTH-012",
    control_name: "Password reset completion",
    coverage: "GET /reset-password with recovery token completes updateUser({ password })",
    expected_outcome: "Password updated, session becomes authenticated, redirect to app",
    failure_condition: "updateUser fails, session not established, or auto-login without reset",
    failure_code: "RESET_COMPLETE_FAILURE",
    blocking: "critical",
    recommendation: "Verify /reset-password page handles type=recovery and calls updateUser.",
  },
  {
    control_id: "AUTH-013",
    control_name: "Account recovery flow",
    coverage: "Full round-trip: request reset → follow email link → sign in with new password",
    expected_outcome: "New credentials succeed at AUTH-001; old credentials fail",
    failure_condition: "old password still valid or new password rejected",
    failure_code: "RECOVERY_FLOW_FAILURE",
    blocking: "critical",
    recommendation: "Rotate refresh tokens on password change (Supabase default).",
  },
  {
    control_id: "AUTH-014",
    control_name: "AuthContext hydration",
    coverage: "AuthProvider resolves session on first paint without loading race",
    expected_outcome: "loading=false after getSession, exactly one profile fetch",
    failure_condition: "duplicate profile fetches, loading stuck true, or bad_jwt handled twice",
    failure_code: "HYDRATION_RACE",
    blocking: "warning",
    recommendation: "Keep initialSessionResolved gating on onAuthStateChange.",
  },
  {
    control_id: "AUTH-015",
    control_name: "Token revocation / logout cleanup",
    coverage: "signOut removes sb-* localStorage keys, PKCE verifier, tenant session keys",
    expected_outcome: "No sb-* keys remain, sessionStorage tenant keys cleared",
    failure_condition: "any sb-* key persists or tenant scope leaks into next session",
    failure_code: "LOGOUT_CLEANUP_FAILURE",
    blocking: "critical",
    recommendation: "Retain clearSupabaseAuthStorage + clearTenantSession in signOut path.",
  },
]);

export const CONTROL_INDEX = Object.freeze(
  Object.fromEntries(AUTH_CONTROLS.map((c) => [c.control_id, c])),
);

export const REQUIRED_CONTROL_IDS = Object.freeze(AUTH_CONTROLS.map((c) => c.control_id));
