import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyStagingCi } from '../../../scripts/verify-staging-ci.mjs';

const repository = 'owner/quantivis';
const sha = 'a'.repeat(40);
const good = { id: 123, path: '.github/workflows/ci.yml', head_sha: sha, head_branch: 'main', event: 'push', repository: { full_name: repository }, head_repository: { full_name: repository }, status: 'completed', conclusion: 'success' };
const response = runs => ({ ok: true, json: async () => ({ workflow_runs: runs }) });
const verify = fetchImpl => verifyStagingCi({ repository, sha, token: 'test-token', fetchImpl });

test('accepts only successful exact-SHA main push CI, despite cancelled duplicates', async () => {
  assert.equal(await verify(async () => response([{ ...good, conclusion: 'cancelled' }, good])), 123);
});

for (const [label, change] of Object.entries({
  failed: { conclusion: 'failure' }, pending: { status: 'in_progress' },
  wrongSha: { head_sha: 'b'.repeat(40) }, branch: { head_branch: 'feature' },
  pullRequest: { event: 'pull_request' }, wrongWorkflow: { path: '.github/workflows/other.yml' },
  fork: { head_repository: { full_name: 'outsider/quantivis' } }, wrongRepo: { repository: { full_name: 'other/repo' } },
})) {
  test(`rejects ${label} CI`, async () => {
    await assert.rejects(verify(async () => response([{ ...good, ...change }])), /No successful/);
  });
}

test('missing, malformed and unauthorized evidence fail closed', async () => {
  await assert.rejects(verify(async () => response([])), /No successful/);
  await assert.rejects(verify(async () => ({ ok: true, json: async () => ({}) })), /Invalid/);
  await assert.rejects(verify(async () => ({ ok: false, status: 401 })), /HTTP 401/);
  await assert.rejects(verify(async () => { throw new Error('network failure'); }), /network failure/);
});

test('paginates filtered runs without treating the first page as complete', async () => {
  let calls = 0;
  assert.equal(await verify(async url => {
    calls++;
    assert.equal(url.searchParams.get('head_sha'), sha);
    assert.equal(url.searchParams.get('event'), 'push');
    assert.equal(url.searchParams.get('page'), String(calls));
    return response(calls === 1 ? Array.from({ length: 100 }, () => ({ ...good, conclusion: 'cancelled' })) : [good]);
  }), 123);
  assert.equal(calls, 2);
});

test('invalid inputs never reach GitHub', async () => {
  await assert.rejects(verifyStagingCi({ repository, sha: 'main', token: 'test', fetchImpl: () => assert.fail('must not call') }), /requires/);
});

test('manual staging is main-only and checks proof before dependencies or mutations', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/deploy-supabase-staging.yml', import.meta.url), 'utf8');
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /actions: read/);
  const proof = workflow.indexOf('run: node scripts/verify-staging-ci.mjs');
  assert.ok(proof > 0);
  assert.ok(proof < workflow.indexOf('run: npm ci'));
  assert.ok(proof < workflow.indexOf('Ensure staging Auth redirect contract'));
});
