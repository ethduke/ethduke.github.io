import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

try {
  if (process.platform !== 'linux' || process.arch !== 'x64' || !process.env.RUNNER_TEMP || !process.env.GITHUB_PATH) throw Error();
  const destination = resolve(process.env.RUNNER_TEMP, 'portfolio-kubo');
  await mkdir(destination, { recursive: true });
  const response = await fetch('https://github.com/ipfs/kubo/releases/download/v0.43.1/kubo_v0.43.1_linux-amd64.tar.gz', { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw Error();
  const data = Buffer.from(await response.arrayBuffer());
  // Digest from the official v0.43.1 GitHub release asset, verified at setup.
  if (data.length > 100 * 1024 * 1024 || createHash('sha256').update(data).digest('hex') !== '3f2bf974ab2a3ec6d997fac7d8cb46f59983a7cddd0b55ef998e6ce379155fb2') throw Error();
  const archive = resolve(destination, 'kubo.tar.gz');
  await writeFile(archive, data);
  await promisify(execFile)('tar', ['-xzf', archive, '-C', destination, 'kubo/ipfs'], { timeout: 30_000 });
  await appendFile(process.env.GITHUB_PATH, resolve(destination, 'kubo') + '\n');
  console.log('Verified Kubo v0.43.1 installed.');
} catch {
  console.error('KUBO_INSTALL_FAILED');
  process.exitCode = 1;
}
