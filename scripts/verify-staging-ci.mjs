import { pathToFileURL } from 'node:url';

export async function verifyStagingCi({ repository, sha, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '') || !token) {
    throw new Error('Staging CI verification requires repository, full SHA and GitHub token');
  }
  for (let page = 1; page <= 100; page++) {
    const url = new URL(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs`);
    url.search = new URLSearchParams({ head_sha: sha, event: 'push', branch: 'main', per_page: '100', page: String(page) }).toString();
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Unable to verify staging CI: GitHub HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.workflow_runs)) throw new Error('Invalid GitHub workflow-run response');
    const match = payload.workflow_runs.find(run =>
      run.path === '.github/workflows/ci.yml' && run.head_sha === sha &&
      run.head_branch === 'main' && run.event === 'push' &&
      run.repository?.full_name === repository && run.head_repository?.full_name === repository &&
      run.status === 'completed' && run.conclusion === 'success');
    if (match) return match.id;
    if (payload.workflow_runs.length < 100) break;
  }
  throw new Error(`No successful main push CI run certifies staging SHA ${sha}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const id = await verifyStagingCi({ repository: process.env.GITHUB_REPOSITORY, sha: process.env.CERTIFIED_SHA, token: process.env.GITHUB_TOKEN });
    console.log(`Verified staging prerequisite CI run ${id} for ${process.env.CERTIFIED_SHA}`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
