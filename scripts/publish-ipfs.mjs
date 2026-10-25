import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, appendFile, readdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { createIPNSRecord, marshalIPNSRecord, unmarshalIPNSRecord } from 'ipns';
import { validate } from 'ipns/validator';
import { CID } from 'multiformats/cid';
import { base36 } from 'multiformats/bases/base36';

const delegated = 'https://delegated-ipfs.dev/routing/v1/ipns/';
const pinataApi = 'https://api.pinata.cloud/v3/files/public';
const pinataUpload = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const transient = new Set([429, 500, 502, 503, 504]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export class PublishError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new PublishError(code, status); };
function contentCid(text) {
  try { const cid = CID.parse(text); if (cid.version !== 1 || cid.code !== 0x70) throw Error(); return cid; }
  catch { fail('INVALID_CONTENT_CID'); }
}
export function signingKey(encoded, expectedName) {
  try {
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error();
    const key = privateKeyFromProtobuf(Buffer.from(encoded, 'base64'));
    if (key.type !== 'Ed25519' || key.publicKey.toCID().toString(base36) !== expectedName) throw Error();
    return key;
  } catch { fail('IPNS_KEY_MISMATCH'); }
}
async function request(fetcher, url, options = {}, retries = 0, delay = wait) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, { redirect: 'error', ...options, signal: AbortSignal.timeout(30_000) });
      if (attempt < retries && transient.has(response.status)) { await response.body?.cancel(); await delay(1000 * (attempt + 1)); continue; }
      return response;
    } catch {
      if (attempt < retries) { await delay(1000 * (attempt + 1)); continue; }
      fail('NETWORK_REQUEST_FAILED');
    }
  }
}
async function json(response) {
  try { const raw = await response.text(); if (raw.length > 1024 * 1024) throw Error(); return JSON.parse(raw); }
  catch { fail('INVALID_PROVIDER_RESPONSE'); }
}
export async function assertFreshHead(context, fetcher = fetch, delay = wait) {
  if (context.repository !== 'ethduke/ethduke.github.io' || context.ref !== 'refs/heads/main' || !['push', 'workflow_dispatch', 'schedule'].includes(context.event) || !/^[0-9a-f]{40}$/.test(context.sha) || !context.token) fail('UNTRUSTED_RELEASE_CONTEXT');
  const response = await request(fetcher, 'https://api.github.com/repos/ethduke/ethduke.github.io/git/ref/heads/main', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${context.token}`, 'X-GitHub-Api-Version': '2022-11-28' } }, 2, delay);
  if (!response.ok) fail('GITHUB_HEAD_READ_FAILED', response.status);
  const data = await json(response);
  if (data.object?.sha !== context.sha) fail('STALE_RELEASE');
}
async function existingPin(cid, token, fetcher, delay) {
  const response = await request(fetcher, `${pinataApi}?cid=${cid}&limit=10`, { headers: { Authorization: `Bearer ${token}` } }, 2, delay);
  if (!response.ok) fail('PINATA_READ_FAILED', response.status);
  const data = await json(response);
  if (!Array.isArray(data.data?.files)) fail('INVALID_PROVIDER_RESPONSE');
  return data.data.files.some(file => file.cid === cid);
}
export async function uploadFailure(response) {
  // Provider bodies can contain identifiers or credentials. Emit fixed codes only.
  let description = '';
  try { description = (await response.text()).slice(0, 16_384).toLowerCase(); } catch {}
  if (/car[\s\S]{0,160}(paid|plan|tier|upgrade)|(?:paid|plan|tier)[\s\S]{0,160}car/.test(description)) fail('PINATA_CAR_PLAN_RESTRICTION', response.status);
  if (/org:files:write|permission|scope|not authorized to (upload|write)|cannot (upload|write)/.test(description)) fail('PINATA_UPLOAD_PERMISSION_MISSING', response.status);
  if (/quota|storage limit|usage limit|insufficient credits|maximum storage/.test(description)) fail('PINATA_STORAGE_LIMIT', response.status);
  if (/cloudflare|cf-error|challenge-platform/.test(description)) fail('PINATA_EDGE_REJECTION', response.status);
  fail('PINATA_UPLOAD_FAILED', response.status);
}
export async function pinBundle(cid, files, token, fetcher = fetch, delay = wait) {
  contentCid(cid);
  if (!token) fail('PINATA_TOKEN_MISSING');
  if (await existingPin(cid, token, fetcher, delay)) return 'existing';
  const body = new FormData();
  for (const file of files) {
    if (!['index.html', 'styles.css', 'favicon.svg', 'index.md', 'llms.txt', 'robots.txt', 'sitemap.xml'].includes(file.name)) fail('INVALID_RELEASE_MANIFEST');
    body.append('file', new Blob([file.bytes]), `portfolio/${file.name}`);
  }
  body.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  body.append('pinataMetadata', JSON.stringify({ name: `ethduke-portfolio-${cid}` }));
  // An ambiguous POST is never repeated automatically.
  const response = await request(fetcher, pinataUpload, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  if (!response.ok) await uploadFailure(response);
  const result = await json(response);
  if (result.IpfsHash !== cid) fail('PINATA_CID_MISMATCH');
  if (!Number.isFinite(result.PinSize) || result.PinSize <= 0) fail('INVALID_PROVIDER_RESPONSE');
  return 'uploaded';
}
export function gatewayOrigins(preferred) {
  const origins = ['https://dweb.link', 'https://ipfs.io'];
  if (preferred) {
    try {
      const url = new URL(preferred);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
      origins.unshift(url.origin);
    } catch { fail('INVALID_GATEWAY_ORIGIN'); }
  }
  return [...new Set(origins)];
}
export async function verifyGateway(cid, manifest, fetcher = fetch, delay = wait, preferred, report = async () => {}) {
  contentCid(cid);
  const hosts = gatewayOrigins(preferred);
  const entries = ['index.html', 'styles.css'].map(name => manifest.files.find(file => file.name === name));
  if (entries.some(entry => !entry || !/^[0-9a-f]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0)) fail('INVALID_RELEASE_MANIFEST');
  const checks = [];
  // Read-only probes may retry while a new pin becomes available. Never retry
  // an upload or pointer mutation here, or lower the byte-verification gate.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const results = await Promise.all(hosts.map(async host => {
      for (const entry of entries) {
        const check = { gateway: host, attempt, file: entry.name, httpStatus: 0, code: 'NETWORK_REQUEST_FAILED' };
        try {
          let response = await request(fetcher, `${host}/ipfs/${cid}/${entry.name}`, { redirect: 'follow' }, 0, delay);
          if ([403, 404].includes(response.status) && entry.name === 'index.html') {
            await response.body?.cancel();
            response = await request(fetcher, `${host}/ipfs/${cid}/`, { redirect: 'follow' }, 0, delay);
          }
          check.httpStatus = response.status;
          if (!response.ok) {
            await response.body?.cancel();
            check.code = 'HTTP_ERROR';
            checks.push(check);
            return null;
          }
          const bytes = Buffer.from(await response.arrayBuffer());
          check.code = bytes.length === entry.bytes && createHash('sha256').update(bytes).digest('hex') === entry.sha256 ? 'VERIFIED' : 'CONTENT_MISMATCH';
        } catch { /* Only fixed diagnostics escape a content gateway. */ }
        checks.push(check);
        if (check.code !== 'VERIFIED') return null;
      }
      return host;
    }));
    await report([...checks]);
    const verified = results.find(Boolean);
    if (verified) return verified;
    if (attempt < 3) await delay(attempt * 15_000);
  }
  fail('PUBLIC_GATEWAY_NOT_VERIFIED');
}
async function currentRecord(name, key, fetcher, delay, nonce) {
  // The routing CDN caches successful GETs for the record TTL, including after PUT.
  const url = delegated + name + '?verification=' + encodeURIComponent(nonce);
  const response = await request(fetcher, url, { headers: { Accept: 'application/vnd.ipfs.ipns-record', 'Cache-Control': 'no-cache' } }, 2, delay);
  if (response.status === 404) return null;
  if (!response.ok) fail('IPNS_READ_FAILED', response.status);
  // Routing API §6.1.2: a 200 response with another media type means no record.
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/vnd.ipfs.ipns-record') {
    await response.body?.cancel();
    return null;
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 10_240) throw Error();
    await validate(key.publicKey, bytes);
    const record = unmarshalIPNSRecord(bytes);
    if (!record.value.startsWith('/ipfs/')) throw Error();
    contentCid(record.value.slice(6));
    return record;
  } catch { fail('INVALID_IPNS_RECORD'); }
}
export async function updatePointer({ cid, key, name, context, fetcher = fetch, delay = wait, now = Date.now, progress = async () => {} }) {
  contentCid(cid);
  const previous = await currentRecord(name, key, fetcher, delay, `previous-${now()}`);
  const clock = BigInt(now()) * 1000n;
  const sequence = previous && previous.sequence >= clock ? previous.sequence + 1n : clock;
  const record = await createIPNSRecord(key, `/ipfs/${cid}`, sequence, 72 * 60 * 60 * 1000, { ttlNs: 300_000_000_000n, v1Compatible: false });
  const bytes = marshalIPNSRecord(record);
  await validate(key.publicKey, bytes);
  await assertFreshHead(context, fetcher, delay);
  await progress({ state: 'publishing', previousCid: previous?.value.slice(6) ?? null, sequence: sequence.toString(), validUntil: record.validity });
  const response = await request(fetcher, delegated + name, { method: 'PUT', headers: { 'Content-Type': 'application/vnd.ipfs.ipns-record' }, body: bytes });
  if (!response.ok) fail('IPNS_PUBLISH_FAILED', response.status);
  for (let attempt = 0; attempt < 8; attempt++) {
    const observed = await currentRecord(name, key, fetcher, delay, `${sequence}-${attempt}`);
    if (observed?.value === `/ipfs/${cid}` && observed.sequence >= sequence) return { previousCid: previous?.value.slice(6) ?? null, sequence: observed.sequence.toString(), validUntil: observed.validity };
    if (observed && observed.sequence > sequence) fail('CONCURRENT_IPNS_PUBLISHER');
    await delay(3000);
  }
  fail('IPNS_PUBLISH_UNVERIFIED');
}
export async function release({ cid, files, manifest, encodedKey, config, context, token, preferredGateway, fetcher = fetch, delay = wait, progress = async () => {} }) {
  if (manifest.repository !== config.repository || manifest.sourceCommit !== context.sha) fail('RELEASE_PROVENANCE_MISMATCH');
  if (!token) fail('PINATA_TOKEN_MISSING');
  gatewayOrigins(preferredGateway);
  const key = signingKey(encodedKey, config.ipnsName);
  await assertFreshHead(context, fetcher, delay);
  await progress({ state: 'pinning' });
  const pin = await pinBundle(cid, files, token, fetcher, delay);
  await progress({ state: 'pinned', pin });
  const gateway = await verifyGateway(cid, manifest, fetcher, delay, preferredGateway, gatewayChecks => progress({ state: 'verifying', gatewayChecks }));
  await progress({ state: 'verified', gateway });
  const result = await updatePointer({ cid, key, name: config.ipnsName, context, fetcher, delay, progress });
  await progress({ state: 'published', ...result });
  return result;
}
export async function verifyPages(manifest, fetcher = fetch, delay = wait) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let matches = true;
    for (const name of ['index.html', 'styles.css']) {
      const entry = manifest.files.find(file => file.name === name);
      const response = await request(fetcher, `https://ethduke.github.io/${name}?release=${manifest.sourceCommit}`, {}, 1, delay);
      if (!response.ok || !entry) { matches = false; break; }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) { matches = false; break; }
    }
    if (matches) return;
    await delay(10_000);
  }
  fail('PAGES_RELEASE_NOT_VERIFIED');
}
async function main() {
  const dist = resolve('dist');
  await mkdir(dist, { recursive: true });
  const context = { repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, event: process.env.GITHUB_EVENT_NAME, sha: process.env.GITHUB_SHA, token: process.env.GITHUB_TOKEN };
  let result = { repository: 'ethduke/ethduke.github.io', sourceCommit: context.sha, state: 'preflight' };
  const progress = async patch => { result = { ...result, ...patch }; await writeFile(resolve(dist, 'publish-result.json'), JSON.stringify(result, null, 2) + '\n'); };
  try {
    const config = JSON.parse(await readFile('publish.config.json', 'utf8'));
    const manifest = JSON.parse(await readFile(resolve(dist, 'release-manifest.json'), 'utf8'));
    if (!process.env.PINATA_JWT) fail('PINATA_TOKEN_MISSING');
    signingKey(process.env.IPNS_PRIVATE_KEY, config.ipnsName);
    await assertFreshHead(context);
    await verifyPages(manifest);
    // Confirm that the assembled, committed export still matches its manifest.
    const expected = ['index.html', 'styles.css', 'favicon.svg', 'index.md', 'llms.txt', 'robots.txt', 'sitemap.xml'];
    const files = [];
    if (manifest.files.length !== expected.length || new Set(manifest.files.map(file => file.name)).size !== expected.length || (await readdir(resolve(dist, 'ipfs'))).sort().join() !== [...expected].sort().join()) fail('INVALID_RELEASE_MANIFEST');
    for (const file of manifest.files) {
      if (!expected.includes(file.name) || !(await lstat(resolve(dist, 'ipfs', file.name))).isFile() || (await lstat(resolve(dist, 'ipfs', file.name))).isSymbolicLink()) fail('INVALID_RELEASE_MANIFEST');
      const bytes = await readFile(resolve(dist, 'ipfs', file.name));
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) fail('RELEASE_BYTES_CHANGED');
      files.push({ name: file.name, bytes });
    }
    const repo = resolve(process.env.RUNNER_TEMP, 'portfolio-ipfs');
    const env = { PATH: process.env.PATH, IPFS_PATH: repo, HOME: process.env.HOME };
    const command = promisify(execFile);
    await command('ipfs', ['init', '--profile=server'], { env, timeout: 30_000 });
    const added = await command('ipfs', ['add', '--offline', '--recursive', '--cid-version=1', '--raw-leaves=true', '--chunker=size-262144', '--pin=false', '--quieter', resolve(dist, 'ipfs')], { env, timeout: 30_000 });
    const cid = contentCid(added.stdout.trim()).toString();
    result = { ...result, cid, ipnsName: config.ipnsName, workflowRun: process.env.GITHUB_RUN_ID };
    await progress({ state: 'prepared' });
    await release({ cid, files, manifest, encodedKey: process.env.IPNS_PRIVATE_KEY, config, context, token: process.env.PINATA_JWT, preferredGateway: process.env.IPFS_GATEWAY_ORIGIN, progress });
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Portfolio published\n\n- Commit: \`${context.sha}\`\n- IPFS: \`${cid}\`\n- Shared address: \`ipns://${config.ipnsName}\`\n- Previous CID: \`${result.previousCid ?? 'initial publication'}\`\n- Valid until: ${result.validUntil}\n\nENS and Gwei must each use the shared IPNS address once.\n`);
    console.log('IPFS_PINNED_AND_IPNS_VERIFIED');
  } catch (error) {
    const code = error instanceof PublishError ? error.code : 'PUBLISH_INTERNAL_FAILURE';
    const status = error instanceof PublishError ? error.status : 0;
    const state = result.state === 'published' ? 'published_reporting_failed' : result.state === 'publishing' ? 'publish_unverified' : 'failed_before_pointer_update';
    try { await progress({ state, code, httpStatus: status }); } catch { console.error('PUBLICATION_RECORD_WRITE_FAILED'); }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const gatewayTable = result.gatewayChecks?.length ? '\n\n| Gateway | Attempt | File | HTTP | Result |\n|---|---:|---|---:|---|\n' + result.gatewayChecks.map(check => `| ${check.gateway} | ${check.attempt} | ${check.file} | ${check.httpStatus} | ${check.code} |`).join('\n') : '';
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## IPFS release incomplete\n\nCode: \`${code}\`; HTTP status: ${status}.\n\n${code === 'PINATA_TOKEN_MISSING' ? 'Add PINATA_JWT to the ipfs-publish environment, then run Publish portfolio on main.' : 'Inspect the sanitized release record. Reconcile any unverified pointer update before retrying.'}${gatewayTable}\n`);
    }
    console.error(`${code} (HTTP ${status})`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
