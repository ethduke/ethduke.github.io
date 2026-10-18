import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = [
  '.githooks/commit-msg', '.githooks/pre-commit', '.gitignore', '.nojekyll',
  'README.md', 'favicon.svg', 'index.html', 'index.md', 'llms.txt',
  'robots.txt', 'sitemap.xml', 'scripts/check-public.mjs', 'styles.css',
];
const git = (...args) => execFileSync('git', args, { cwd: root });
const fail = message => { console.error(message); process.exit(1); };

if (process.argv[2] === '--message') {
  const message = readFileSync(process.argv[3], 'utf8').trim();
  const format = /^(feat|fix|doc|docs|style|refactor|perf|test|build|ci|chore|revert): [a-z0-9][^\r\n]*$/;
  if (!format.test(message) || message !== message.toLowerCase()) {
    fail('Use type: one lowercase sentence on a single line, without a body.');
  }
  if (/[!?]|\.(?:\s|$).+/.test(message)) fail('Keep the commit message to one sentence.');
  console.log('Commit message check passed.');
  process.exit(0);
}

if (process.argv.length > 2 && process.argv[2] !== '--staged') fail('Unknown check option.');
const staged = process.argv.includes('--staged');
const names = staged
  ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').toString().split('\0').filter(Boolean)
  : allowed;
const findings = [];
const patterns = [
  ['private key material', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['cloud access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['API token', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['credential assignment', /\b(?:api[_-]?key|password|secret|access[_-]?token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i],
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['personal profile link', /https?:\/\/(?:www\.)?linkedin\.com\//i],
  ['private absolute path', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/],
];
for (const name of names) {
  if (name.split('/').at(-1).toLowerCase() === 'agents.md') { findings.push(`${name}: local agent instructions must never be committed`); continue; }
  if (!allowed.includes(name)) { findings.push(`${name}: path is not approved`); continue; }
  let content;
  if (staged) {
    const mode = git('ls-files', '--stage', '--', name).toString().split(' ')[0];
    if (mode === '120000' || mode === '160000') { findings.push(`${name}: links and submodules are not allowed`); continue; }
    content = git('show', `:${name}`);
  } else {
    if (!lstatSync(resolve(root, name)).isFile()) { findings.push(`${name}: expected a regular file`); continue; }
    content = readFileSync(resolve(root, name));
  }
  if (content.length > 100 * 1024) findings.push(`${name}: exceeds 100 KiB`);
  if (content.includes(0)) findings.push(`${name}: binary content is not allowed`);
  const text = content.toString('utf8');
  for (const [label, pattern] of patterns) if (pattern.test(text)) findings.push(`${name}: possible ${label}`);
}
if (findings.length) fail(findings.join('\n'));
console.log(`Public-content checks passed for ${names.length} ${staged ? 'staged' : 'working-tree'} files.`);
