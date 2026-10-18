import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root });
const files = ['index.html', 'styles.css', 'favicon.svg', 'index.md', 'llms.txt', 'robots.txt', 'sitemap.xml'];
const output = resolve(root, 'dist/ipfs');
const temporary = resolve(root, 'dist/ipfs.tmp');
const sourceCommit = git('rev-parse', 'HEAD').toString().trim();
const manifest = { sourceCommit, files: [] };

// Export committed site files only. Never copy a checkout or arbitrary folder.
try {
  if (existsSync(temporary)) throw new Error('A temporary export already exists; review it before retrying.');
  mkdirSync(temporary, { recursive: true });
  for (const name of files) {
    const entry = git('ls-tree', sourceCommit, '--', name).toString();
    if (!entry.startsWith('100644 blob ')) throw new Error(`Expected a committed regular site file: ${name}`);
    const data = git('show', `${sourceCommit}:${name}`);
    if (data.length > 100 * 1024 || data.includes(0)) throw new Error(`Unexpected file size or binary content: ${name}`);
    writeFileSync(resolve(temporary, name), data, { flag: 'wx' });
    manifest.files.push({ name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  if (readdirSync(temporary).length !== files.length) throw new Error('Unexpected export contents.');
  if (existsSync(output)) rmSync(output, { recursive: true });
  renameSync(temporary, output);
  writeFileSync(resolve(root, 'dist/ipfs-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Prepared dist/ipfs with ${files.length} committed site files from ${sourceCommit.slice(0, 7)}.`);
  console.log('File hashes are recorded in ignored dist/ipfs-manifest.json.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
