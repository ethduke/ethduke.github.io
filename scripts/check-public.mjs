import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reviewed synthetic-only export: exact paths and hashes; no app source or local data.
const demoAssets = new Map([
  [
    "program-lens/.nojekyll",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  ],
  [
    "program-lens/404.html",
    "8d1f6cc54f8d99bd1530e09376b74784566f927577f201e91adf839d5b953db3"
  ],
  [
    "program-lens/404/index.html",
    "8d1f6cc54f8d99bd1530e09376b74784566f927577f201e91adf839d5b953db3"
  ],
  [
    "program-lens/__next.__PAGE__.txt",
    "7f73d984f7e0645314b7bfa0fe89d0d6054e23e58d4a7c6ad4cde919fd1822b5"
  ],
  [
    "program-lens/__next._full.txt",
    "25bb745aa74fe9a862e47b2986ca71955a19da5e09177036f36b692c51807f38"
  ],
  [
    "program-lens/__next._tree.txt",
    "8652661183573e926e116d4f881f0ed4688db2acc59ec5dbda591f46aa5979ec"
  ],
  [
    "program-lens/_next/static/7MPBMy6XwbaLRbUIOXVuh/_buildManifest.js",
    "735100de5b4d0775a309ea72b2859f679aa4da5efee09ef54bddcf7e928aaa1c"
  ],
  [
    "program-lens/_next/static/7MPBMy6XwbaLRbUIOXVuh/_ssgManifest.js",
    "678f6ce2cb80b1fe72fc67e7412be6e2ab6ada083111b64f7c40d35e3cba5e00"
  ],
  [
    "program-lens/_next/static/chunks/158-19105a7813e81fb8.js",
    "28cd999798caabd8ced62053884bd9713d1a3bfc35acd90d06a3f2ccc87d328f"
  ],
  [
    "program-lens/_next/static/chunks/app/_global-error/page-b656bfa1d65ad738.js",
    "87701a78fb818579f446f525aee980b82b20ac611add35ca1399539a3f547fea"
  ],
  [
    "program-lens/_next/static/chunks/app/_not-found/page-153d98da622cea2b.js",
    "1f95d349ae995b0f933ff4553ae571e418052ca603dbb36a3a731f33a81cf48c"
  ],
  [
    "program-lens/_next/static/chunks/app/layout-60854bca3600ae61.js",
    "07131c201b82afab8a93c36b50ff34625ae3a6d81a19eff4bc32e00d56d4e068"
  ],
  [
    "program-lens/_next/static/chunks/app/page-3ae8b711a4ea917e.js",
    "ea9ebd7defc6c460439d7114090b67b7df8038bc328c2d618658efeb9f2945d4"
  ],
  [
    "program-lens/_next/static/chunks/c7879cf7-33323d49ba6da96a.js",
    "7684120bd04ed1d3d1ffd4fdd799237fcaaf87ca943a0e1f09897f6901600a15"
  ],
  [
    "program-lens/_next/static/chunks/framework-daae672d050d1c9a.js",
    "8dbe64d7d82f58a213aeb665e075c1475f3e5b94094bf4b64b94ee8f92d6c9ef"
  ],
  [
    "program-lens/_next/static/chunks/main-63d9bb9d169634e5.js",
    "34165b897e068ece27c6c7bb308257b32707004b10109d2dfd007f2b57acf65a"
  ],
  [
    "program-lens/_next/static/chunks/main-app-66a5ed014d303258.js",
    "e43d5ce192fe9e1233fc9b2a323e28cdd154b2b60e01fe217fc9276cd212706f"
  ],
  [
    "program-lens/_next/static/chunks/next/dist/client/components/builtin/app-error-b656bfa1d65ad738.js",
    "87701a78fb818579f446f525aee980b82b20ac611add35ca1399539a3f547fea"
  ],
  [
    "program-lens/_next/static/chunks/next/dist/client/components/builtin/forbidden-b656bfa1d65ad738.js",
    "87701a78fb818579f446f525aee980b82b20ac611add35ca1399539a3f547fea"
  ],
  [
    "program-lens/_next/static/chunks/next/dist/client/components/builtin/global-error-a9cad7a52ea1ff6f.js",
    "d63905e5c55a15f1c93d0d21e8c60df43f8c525dec570c1a3f557bdad9e5aa2e"
  ],
  [
    "program-lens/_next/static/chunks/next/dist/client/components/builtin/not-found-b656bfa1d65ad738.js",
    "87701a78fb818579f446f525aee980b82b20ac611add35ca1399539a3f547fea"
  ],
  [
    "program-lens/_next/static/chunks/next/dist/client/components/builtin/unauthorized-b656bfa1d65ad738.js",
    "87701a78fb818579f446f525aee980b82b20ac611add35ca1399539a3f547fea"
  ],
  [
    "program-lens/_next/static/chunks/polyfills-42372ed130431b0a.js",
    "0973c1d64c88adc8e3c950410cb58b288f72118d5965b78049438deb8f2f9683"
  ],
  [
    "program-lens/_next/static/chunks/webpack-3224cf8dd77713bb.js",
    "08b6834abfd1a6b2c73bd40eda18e34cb1d089a006feec9b08a0490133311157"
  ],
  [
    "program-lens/_next/static/css/f7e7076df9f5f4c7.css",
    "dc7e9b4dcfb1c997dc01d0510720b9edbff1265b703b05a42579ea9a1c7e9d16"
  ],
  [
    "program-lens/_not-found/__next._full.txt",
    "c3b611998430bbd40768fcfea92cce4d65fde91aa889035c9457757c5e32ae1c"
  ],
  [
    "program-lens/_not-found/__next._not-found.__PAGE__.txt",
    "b453ecf17dcb3119c1ec051863848e0b783673f4d3583a526ad8a990b6ca680b"
  ],
  [
    "program-lens/_not-found/__next._tree.txt",
    "76a3b83cbfa6b7d70d8d0b826a3a92c18b8874149459daa85969e3471c5a68fa"
  ],
  [
    "program-lens/_not-found/index.html",
    "8d1f6cc54f8d99bd1530e09376b74784566f927577f201e91adf839d5b953db3"
  ],
  [
    "program-lens/_not-found/index.txt",
    "c3b611998430bbd40768fcfea92cce4d65fde91aa889035c9457757c5e32ae1c"
  ],
  [
    "program-lens/index.html",
    "4e1640aac95fcc387c7d8a5f543a688932379e8e06e8e13ebf054457edc707c2"
  ],
  [
    "program-lens/index.txt",
    "25bb745aa74fe9a862e47b2986ca71955a19da5e09177036f36b692c51807f38"
  ]
]);
const allowed = [
  '.githooks/commit-msg', '.githooks/pre-commit', '.gitignore', '.nojekyll',
  'README.md', 'favicon.svg', 'index.html', 'index.md', 'llms.txt',
  'robots.txt', 'sitemap.xml', 'scripts/check-public.mjs', 'scripts/prepare-ipfs.mjs', 'styles.css',
  ...demoAssets.keys(),
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
  ? [...new Set([...git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').toString().split('\0').filter(Boolean), ...demoAssets.keys()])]
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
    if (!['100644', '100755'].includes(mode)) { findings.push(`${name}: missing regular staged file or prohibited link/submodule`); continue; }
    content = git('show', `:${name}`);
  } else {
    if (!lstatSync(resolve(root, name)).isFile()) { findings.push(`${name}: expected a regular file`); continue; }
    content = readFileSync(resolve(root, name));
  }
  const demoHash = demoAssets.get(name);
  const limit = demoHash ? 1024 * 1024 : 100 * 1024;
  if (content.length > limit) findings.push(`${name}: exceeds approved file-size limit`);
  if (demoHash && createHash('sha256').update(content).digest('hex') !== demoHash) findings.push(`${name}: synthetic export hash mismatch`);
  if (content.includes(0)) findings.push(`${name}: binary content is not allowed`);
  const text = content.toString('utf8');
  for (const [label, pattern] of patterns) if (pattern.test(text)) findings.push(`${name}: possible ${label}`);
}
if (findings.length) fail(findings.join('\n'));
console.log(`Public-content checks passed for ${names.length} ${staged ? 'staged' : 'working-tree'} files.`);
