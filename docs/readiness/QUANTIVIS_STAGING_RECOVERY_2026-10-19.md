# Quantivis staging recovery and commercial GA blocker register

**Read-only evidence checkpoint:** 2026-10-19  
**Status:** **NO-GO** for first customer and broad commercial GA  
**Canonical repository:** `stanleymay20/quantisights-pro-c6abd242`  
**Current inspected main SHA:** `d891f95aea383864c3a20df2733213b74cc05415`

This is a controlled **recovery/runbook** document. It does not mean the problems are fixed, environments restored, migrations applied, or a client pilot approved. Update each item only with new dated evidence.

## 1. Observed release evidence

| Signal | Verified result | Authority |
|---|---|---|
| GitHub main SHA | `d891f95aea383864c3a20df2733213b74cc05415` (2026-10-18) | [Commit](https://github.com/stanleymay20/quantisights-pro-c6abd242/commit/d891f95aea383864c3a20df2733213b74cc05415) |
| Main CI | **Success** on exact SHA | [CI run 39118362241](https://github.com/stanleymay20/quantisights-pro-c6abd242/actions/runs/39118362241) |
| Disposable PostgreSQL reconciliation proof | **Success** on exact SHA using synthetic fixture, not hosted Supabase | [Proof 39118362119](https://github.com/stanleymay20/quantisights-pro-c6abd242/actions/runs/39118362119) |
| Staging deployment | **Failure** on exact SHA | [Deploy 39118581362](https://github.com/stanleymay20/quantisights-pro-c6abd242/actions/runs/39118581362) |
| Failing step | `Ensure staging Auth redirect contract` | [Staging workflow](../../.github/workflows/deploy-supabase-staging.yml) |
| Exact error | `Supabase Auth config GET failed: Invalid access token` from `scripts/configure-supabase-google-oauth.mjs` | Staging deployment job 117649329017 log |
| Downstream staging migration/Edge deployment steps | **Skipped** after Auth configuration failure | Same deploy job |
| Main client acceptance | **Skipped** | [Run 39118713765](https://github.com/stanleymay20/quantisights-pro-c6abd242/actions/runs/39118713765) |
| Netlify published deploy | Ready state, production artifact from **2026-09-30**, commit `99a1ba856e2cea6602018b643332c2b10b660ab9` | Netlify `quantivis` deploy `6abd1dc79263040008324215` |
| Deployment vs main | **Different SHAs**; do not call current main production-deployed | Above records |
| Quantivis Supabase access through currently connected account | **Unavailable**: linked account listed other projects, not Quantivis staging/production | Authenticated account-level project listing at checkpoint |

Environment identities from existing authoritative repo docs:
- Staging: `cmnihsbdbpubznlkmjbc`
- Production: `izgfrekdamlgigehxoqs`
- Retired/do not target: `itpwpnwzzitkelffttyx`

The existing [GA status report](../GA_STATUS_2026-09-30.md) previously recorded inactive provider projects blocked by **unpaid invoices**. This is a **historical documented blocker, not a freshly verified billing result**. Recheck provider state with the correct authorized Supabase organization; never infer that CI green implies account good standing.

## 2. Root cause and no-code-change boundary

The staging workflow already requires a nonempty `SUPABASE_ACCESS_TOKEN`. A nonempty token is **not proof of valid management authorization**. It invokes `scripts/configure-supabase-google-oauth.mjs redirects-only`, whose initial authenticated Management API GET fails with **Invalid access token**, before the intended redirect configuration PATCH/read-back.

This is primarily an **environment credential/authorization** failure, not evidence that the redirect script logic or tested core application is broken. Changing the code, relaxing the check or skipping Auth verification is **not** a fix.

Do not print, paste, echo or commit Supabase personal access tokens, service-role secrets, database passwords, Stripe keys or Resend API keys. Do not reroute this workflow to production.

## 3. Owner actions — restore authority, then prove functionality

The authorized account owner or release engineer completes the following; assistants without the correct account access cannot claim completion.

1. **Confirm Supabase billing and organization scope.** Sign into the organization that owns **both intended projects**. Check for unpaid invoices and inactive projects. Settle outstanding provider obligations where necessary. Record the projects' current state and the verification time privately in release evidence; do not expose financial/account identifiers in public issue comments.
2. **Restore the pre-existing environments only.** Do not provision replacement databases, change project refs, or copy production data into a new project to bypass billing or permission blockers.
3. **Issue/choose an authorized management credential.** Use a valid Supabase personal access token/management credential permitted to read and configure *staging*. Determine its account owner and scope without displaying its value.
4. **Update the existing GitHub `staging` Environment secret** `SUPABASE_ACCESS_TOKEN` securely. Prefer the Environment, not a wide-scope repository secret. Do not alter the production Environment credentials in this operation.
5. **Verify exact target ref** for the staging workflow remains `cmnihsbdbpubznlkmjbc`; the retired and production refs must be excluded.
6. **Run the existing staging workflow on a CI-certified main SHA**, preserving its protected Environment approval policies and immutable-commit controls. Before dispatch, verify the desired commit passed all mandatory main CI checks.
7. **Collect the Auth configuration GET, PATCH and read-back result** without logging secret values. Continue only when the site URL and redirect allowlist match expected staging values.
8. **Review migration preview** against the real staging schema and ledger. Resolve drift forward with reviewed migrations only; do not delete migration history or apply synthetic PostgreSQL fixture scripts.
9. **Deploy and verify Edge Functions** from the same exact candidate SHA. Confirm the bounded execution/reconciliation functions and their database contracts in the intended environment.
10. **Run security advisors and positive/negative tenant-isolation checks** under actual staging Auth/RLS. Resolve critical/high-risk privileged RPC, policy, function execute, authentication and provider-secret issues. Document accepted residual risk.
11. **Test external providers and revenue lifecycles** in appropriately isolated staging. Validate email delivery, authorized action retries/reconciliation and test-mode Stripe checkout/webhook/customer portal/idempotency; no real charge until separately approved.
12. **Pass GA Staging Validation and Client Acceptance** with immutable references to the same candidate SHA, database migration state, Edge Function versions and evidence artifacts.
13. **Require independent security, QA and release review** before considering a production promotion. Use manual protected deployment; verify `/release.json`, production Auth, source fingerprint, customer routes, observability and rollback readiness.
14. Record release owner, approvals, results, unresolved risk, incident contacts, restore test and **GO/NO-GO** status. The default is **NO-GO** until evidence exists.

## 4. Existing open PRs: do not flatten into main

The following unmerged PRs contain overlapping or sensitive changes and are **not** evidence of current production readiness:
- [#44 Staging Auth transport](https://github.com/stanleymay20/quantisights-pro-c6abd242/pull/44): review current applicability and provider account continuity; historical PR text cannot certify present state.
- [#52 First paying customer billing](https://github.com/stanleymay20/quantisights-pro-c6abd242/pull/52): draft; require current-main comparison, migration reconciliation, replay and real staging payments before any merge.
- [#59 External AI evidence wedge](https://github.com/stanleymay20/quantisights-pro-c6abd242/pull/59): draft; dependency audit, tenant/RLS, external producer real ingestion and authoritative staging validation remain prerequisites.

For every open PR, first establish whether equivalent functionality has already landed in main. Never mass-merge old stacked PRs or bypass exact-head CI.

## 5. Release-gate matrix

| Gate | Required evidence | Checkpoint |
|---|---|---|
| Owner payment and project state | Both canonical hosted projects active and correctly scoped | UNKNOWN; historical inactive/billing blocker |
| Staging token | Authorized read/configure management credential; no secret disclosure | FAIL — invalid access token |
| Main source CI | Exact-SHA mandatory lint/type/test/audit/build pass | PASS — current main SHA only |
| Hosted migration parity | Staging schema + applied migrations reconciled to source | NOT TESTED on current main |
| Hosted Supabase Auth/RLS | Positive/negative tenant controls, security advisors | NOT TESTED on current main |
| Hosted external action/reconciliation | Actual provider proof, immutable receipts, no false success | NOT TESTED on current main |
| Auth email and account recovery | Actual staging customer-journey delivery and capacity | NOT TESTED on current main |
| Stripe payment lifecycle | End-to-end isolated test-mode evidence and attributed subscriptions | NOT TESTED on current main |
| Staging GA/client acceptance | Exact-SHA passing signed artifacts | FAIL/SKIPPED |
| Netlify release identity | Live current commit and backend ref verified | STALE relative to main |
| Production smoke and recovery | Controlled deploy, synthetic tenant smoke, restore/recovery proof | NOT TESTED on current main |
| Commercial GA | ALL critical gates pass | **NO-GO** |

## 6. Resume conditions for the enterprise supplier pilot

Do not apply supplier-risk migrations, invoke external supplier actions or onboard external customer data while P0 blockers remain. Discovery interviews, static process design, synthetic fixture refinement and documentation may continue safely.

The next engineering tranche should be chosen **after** staging authority is repaired and a fresh read-only hosted schema/Edge/security audit determines whether the remaining supplier execution adapters are truly missing.

See [Supplier pilot specification](../architecture/QUANTIVIS_ENTERPRISE_CAPABILITY_SUPPLIER_PILOT_2026-10-19.md), [product doctrine](../PRODUCT_DOCTRINE.md), [first-client pilot runbook](../PILOT_OPERATIONS.md), and [existing release-gate definition](../enterprise/RELEASE_GATE.md).

**Owner sign-off is required before the production environment, live customer data, billing or outbound provider calls are changed.**
