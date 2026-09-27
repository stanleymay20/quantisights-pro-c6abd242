#!/usr/bin/env node

// Verifies the live privilege boundary of a Quantivis Supabase project:
//   1. anon executes no public SECURITY DEFINER function;
//   2. authenticated executes only the allowlisted SECURITY DEFINER functions
//      in supabase/security/client-callable-definer-functions.json;
//   3. every public function referenced by an RLS policy is executable by
//      authenticated (otherwise the policy raises "permission denied");
//   4. authenticated can reach every public table (RLS decides row access),
//      so staging exercises the same privilege surface as production.
// Read-only: it runs catalog SELECTs through the Supabase Management API.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_REF = "izgfrekdamlgigehxoqs";
const STAGING_REF = "cmnihsbdbpubznlkmjbc";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

if (!accessToken) fail("SUPABASE_ACCESS_TOKEN must be set");
if (![PRODUCTION_REF, STAGING_REF].includes(projectRef)) {
  fail(`Unrecognised Supabase project ref: ${projectRef || "unset"}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistFile = JSON.parse(
  readFileSync(resolve(root, "supabase/security/client-callable-definer-functions.json"), "utf8"),
);
const allowlist = new Set([...allowlistFile.tenantGuardedRpcs, ...allowlistFile.rlsPolicyHelpers]);

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Management API database query failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Management API database query returned a non-array payload");
  return rows;
}

const DEFINER_SQL = `
select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 1, 2`;

const POLICY_HELPER_SQL = `
select distinct p.proname as name, pol.tablename as table_name, pol.policyname as policy
from pg_policies pol
join pg_proc p
  on p.pronamespace = 'public'::regnamespace
 and (coalesce(pol.qual, '') ~ ('\\m' || p.proname || '\\(')
      or coalesce(pol.with_check, '') ~ ('\\m' || p.proname || '\\('))
where pol.schemaname = 'public'
  and (pol.roles && array['authenticated', 'public']::name[])
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by 1, 2`;

const TABLE_SQL = `
select c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and not (c.relrowsecurity
           and has_table_privilege('authenticated', c.oid, 'SELECT')
           and has_table_privilege('service_role', c.oid, 'SELECT'))
order by 1`;

try {
  const failures = [];

  const definers = await query(DEFINER_SQL);
  for (const fn of definers) {
    const signature = `public.${fn.name}(${fn.args})`;
    if (fn.anon_exec) failures.push(`anon can execute SECURITY DEFINER ${signature}`);
    if (fn.auth_exec && !allowlist.has(fn.name)) {
      failures.push(`authenticated can execute non-allowlisted SECURITY DEFINER ${signature}`);
    }
  }

  const brokenPolicies = await query(POLICY_HELPER_SQL);
  for (const row of brokenPolicies) {
    failures.push(
      `RLS policy "${row.policy}" on ${row.table_name} calls ${row.name}() which authenticated cannot execute`,
    );
  }

  const unreachableTables = await query(TABLE_SQL);
  for (const row of unreachableTables) {
    failures.push(`public.${row.name} lacks RLS or authenticated/service_role table grants`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`::error::${failure}`);
    fail(`${failures.length} privilege-boundary violation(s) on ${projectRef}`);
  }

  const exposed = definers.filter((fn) => fn.auth_exec).length;
  console.log(
    `Verified privilege boundary on ${projectRef}: ${definers.length} SECURITY DEFINER functions, ` +
      `${exposed} allowlisted for authenticated, 0 for anon; all RLS helpers executable; all tables RLS-guarded and reachable.`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
