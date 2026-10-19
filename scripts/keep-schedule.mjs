import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// GitHub disables scheduled workflows after 60 days of public-repo inactivity.
// A metadata-only commit after 40 idle days preserves the requested publisher.
export async function keepSchedule({ token, event, ref, fetcher = fetch, now = Date.now }) {
  if (event !== 'schedule' || ref !== 'refs/heads/main' || !token) throw Error('UNTRUSTED_KEEPALIVE_CONTEXT');
  const api = async (path, method = 'GET', body) => {
    const response = await fetcher(`https://api.github.com/repos/ethduke/ethduke.github.io/${path}`, { method, redirect: 'error', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error('KEEPALIVE_API_FAILED');
    return response.json();
  };
  const current = await api('commits/main');
  const date = Date.parse(current.commit?.committer?.date);
  const tree = current.commit?.tree?.sha;
  if (!Number.isFinite(date) || !/^[a-f0-9]{40}$/.test(current.sha) || !/^[a-f0-9]{40}$/.test(tree)) throw Error('KEEPALIVE_INVALID_HEAD');
  if (now() - date < 40 * 24 * 60 * 60 * 1000) return 'not_needed';
  const next = await api('git/commits', 'POST', { message: 'chore: keep scheduled ipns publishing active', tree, parents: [current.sha] });
  if (!/^[a-f0-9]{40}$/.test(next.sha)) throw Error('KEEPALIVE_INVALID_COMMIT');
  // A concurrent change to main causes this non-forced update to fail safely.
  await api('git/refs/heads/main', 'PATCH', { sha: next.sha, force: false });
  return 'empty_commit_created';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(await keepSchedule({ token: process.env.GITHUB_TOKEN, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF })); }
  catch { console.error('SCHEDULE_KEEPALIVE_FAILED'); process.exitCode = 1; }
}
