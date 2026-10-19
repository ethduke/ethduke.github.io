import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagesFiles, portfolioFiles } from './site-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root });
const sourceCommit = git('rev-parse', 'HEAD').toString().trim();
const manifest = { repository: 'ethduke/ethduke.github.io', sourceCommit, files: [] };
for (const folder of ['pages', 'ipfs']) {
  const target = resolve(root, 'dist', folder);
  rmSync(target, { force: true, recursive: true });
  mkdirSync(target, { recursive: true });
}
for (const name of pagesFiles) {
  if (!git('ls-tree', sourceCommit, '--', name).toString().startsWith('100644 blob ')) throw Error('COMMITTED_FILE_REQUIRED');
  const content = git('show', `${sourceCommit}:${name}`);
  const destination = resolve(root, 'dist/pages', name);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  if (portfolioFiles.includes(name)) {
    writeFileSync(resolve(root, 'dist/ipfs', name), content);
    manifest.files.push({ name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
  }
}
writeFileSync(resolve(root, 'dist/release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared Pages (${pagesFiles.length} files) and IPFS (${portfolioFiles.length} files) from ${sourceCommit.slice(0, 7)}.`);
