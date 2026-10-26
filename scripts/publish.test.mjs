import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { base36 } from 'multiformats/bases/base36';
import { createIPNSRecord, marshalIPNSRecord, unmarshalIPNSRecord } from 'ipns';
import { validate } from 'ipns/validator';
import { release, assertFreshHead, signingKey, updatePointer, verifyPages, verifyGateway, verifyCarBlocks, verifyCarArchive, verifyCarGateway, gatewayOrigins, gatewayAccess, gatewayFailure, uploadFailure, PublishError } from './publish-ipfs.mjs';
import { keepSchedule } from './keep-schedule.mjs';

const cid = 'bafybeicn4yud4kazwvwkhsdp4eeeown5hjqn4bznpngc6imbhzuqiuwuka';
const older = 'bafybeig62o2phfqttuygnwqsjhp2nw2teyjwk7pf53tdtv5bx2r35mmuc4';
const context = { repository: 'ethduke/ethduke.github.io', ref: 'refs/heads/main', event: 'push', sha: 'a'.repeat(40), token: 'test' };
const files = new Map([['index.html', Buffer.from('<p>Reviewed public page</p>')], ['styles.css', Buffer.from('body{background:white}')]]);
const manifest = { repository: context.repository, sourceCommit: context.sha, files: [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })) };
const noDelay = async () => {};
async function harness(options = {}) {
  const releaseCid = options.cid ?? cid;
  const key = await generateKeyPair('Ed25519');
  const name = key.publicKey.toCID().toString(base36);
  const config = { repository: context.repository, ipnsName: name };
  let pinned = options.pinned ?? false, record = options.previous ?? null, headReads = 0;
  const calls = [], stages = [];
  const fetcher = async (url, request = {}) => {
    const method = request.method || 'GET'; calls.push({ url, method });
    if (url.includes('api.github.com')) { headReads++; return Response.json({ object: { sha: options.stale || (options.staleLate && headReads > 1) ? 'b'.repeat(40) : context.sha } }); }
    if (url.includes('api.pinata.cloud/v3/files/public')) return Response.json({ data: { files: pinned ? [{ cid: releaseCid }] : [] } });
    if (url.includes('/pinning/pinFileToIPFS')) {
      if (options.uploadStatus) return Response.json({ error: 'DO_NOT_LOG_THIS_SENTINEL' }, { status: options.uploadStatus });
      assert.equal(request.redirect, 'error');
      assert.equal(JSON.parse(request.body.get('pinataOptions')).cidVersion, 1);
      assert.deepEqual(request.body.getAll('file').map(file => file.name), ['portfolio/index.html', 'portfolio/styles.css']);
      pinned = true; return Response.json({ IpfsHash: options.wrongCid ? older : releaseCid, PinSize: 100 });
    }
    if (url.includes('/ipfs/')) {
      if (options.gatewayFailure) return new Response('unavailable', { status: 503 });
      const name = url.split('/').at(-1); return new Response(files.get(name));
    }
    if (url.includes('/routing/v1/ipns/')) {
      if (method === 'PUT') { await validate(key.publicKey, request.body); if (!options.loseReadback) record = request.body; return new Response(null, { status: 200 }); }
      return record ? new Response(record, { headers: { 'Content-Type': 'application/vnd.ipfs.ipns-record' } }) : options.emptyRecord200 ? new Response('delegate error: routing: not found\n') : new Response(null, { status: 404 });
    }
    throw Error('Unexpected mocked endpoint');
  };
  const args = { cid: releaseCid, files: [...files].map(([name, bytes]) => ({ name, bytes })), manifest, encodedKey: Buffer.from(privateKeyToProtobuf(key)).toString('base64'), config, context, token: 'test', fetcher, delay: noDelay, progress: async stage => stages.push(stage) };
  return { key, name, calls, stages, args, current: () => record };
}

test('successful release uploads the folder, checks its exact CID and public bytes, then signs and reads back IPNS', async () => {
  const h = await harness(); const result = await release(h.args);
  assert.equal(result.previousCid, null);
  const record = unmarshalIPNSRecord(h.current());
  assert.equal(record.value, `/ipfs/${cid}`); assert.equal(record.ttl, 300_000_000_000n);
  assert.equal(h.stages.at(-1).state, 'published');
  const upload = h.calls.findIndex(call => call.method === 'POST');
  const gateway = h.calls.findIndex(call => call.url.includes('/ipfs/'));
  const publish = h.calls.findIndex(call => call.method === 'PUT');
  assert.ok(upload < gateway && gateway < publish);
});
test('scheduled refresh reuses an existing pin without uploading another copy', async () => {
  const h = await harness({ pinned: true });
  await release({ ...h.args, context: { ...context, event: 'schedule' } });
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
});
test('wrong commit and untrusted events make no provider mutation', async () => {
  for (const event of ['pull_request', 'pull_request_target']) {
    const h = await harness();
    await assert.rejects(release({ ...h.args, context: { ...context, event } }), { code: 'UNTRUSTED_RELEASE_CONTEXT' });
    assert.equal(h.calls.length, 0);
  }
  const h = await harness();
  await assert.rejects(release({ ...h.args, manifest: { ...manifest, sourceCommit: 'c'.repeat(40) } }), { code: 'RELEASE_PROVENANCE_MISMATCH' });
  assert.equal(h.calls.length, 0);
});
test('stale commits cannot publish, including a newer commit arriving during pinning', async () => {
  for (const options of [{ stale: true }, { staleLate: true }]) {
    const h = await harness(options);
    await assert.rejects(release(h.args), { code: 'STALE_RELEASE' });
    assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  }
});
test('missing upload token and wrong signing key stop before any network call', async () => {
  const h = await harness();
  await assert.rejects(release({ ...h.args, token: '' }), { code: 'PINATA_TOKEN_MISSING' });
  const other = await generateKeyPair('Ed25519');
  assert.throws(() => signingKey(Buffer.from(privateKeyToProtobuf(other)).toString('base64'), h.name), { code: 'IPNS_KEY_MISMATCH' });
  assert.equal(h.calls.length, 0);
});
test('upload rejection is not retried and cannot change IPNS', async () => {
  const h = await harness({ uploadStatus: 402 });
  await assert.rejects(release(h.args), { code: 'PINATA_UPLOAD_FAILED', status: 402 });
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
});
test('wrong upload CID or unreachable gateway leaves the pointer untouched', async () => {
  for (const [options, code] of [[{ wrongCid: true }, 'PINATA_CID_MISMATCH'], [{ gatewayFailure: true }, 'PUBLIC_GATEWAY_NOT_VERIFIED']]) {
    const h = await harness(options);
    await assert.rejects(release(h.args), { code });
    assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  }
});
test('readback failure after PUT is reported as unverified rather than successful', async () => {
  const h = await harness({ loseReadback: true });
  await assert.rejects(release(h.args), { code: 'IPNS_PUBLISH_UNVERIFIED' });
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(h.stages.at(-1).state, 'publishing');
});
test('version sequence remains monotonic even if the clock moves backwards', async () => {
  const h = await harness();
  const previous = await createIPNSRecord(h.key, `/ipfs/${older}`, 8_000_000n, 3_600_000);
  const raw = marshalIPNSRecord(previous);
  let latest = raw;
  const fetcher = async (url, options = {}) => {
    if (url.includes('api.github.com')) return Response.json({ object: { sha: context.sha } });
    if (options.method === 'PUT') { latest = options.body; return new Response(); }
    return new Response(latest, { headers: { 'Content-Type': 'application/vnd.ipfs.ipns-record' } });
  };
  const result = await updatePointer({ cid, key: h.key, name: h.name, context, fetcher, now: () => 1, delay: noDelay });
  assert.equal(result.sequence, '8000001'); assert.equal(result.previousCid, older);
});
test('pointer reads bypass a cached previous record and validate the new signed response', async () => {
  const h = await harness();
  const previous = marshalIPNSRecord(await createIPNSRecord(h.key, `/ipfs/${older}`, 1n, 3_600_000));
  let latest = previous;
  const fetched = [];
  const fetcher = async (url, options = {}) => {
    if (url.includes('api.github.com')) return Response.json({ object: { sha: context.sha } });
    if (options.method === 'PUT') { latest = options.body; return new Response(); }
    fetched.push(url);
    return new Response(new URL(url).searchParams.has('verification') ? latest : previous, { headers: { 'Content-Type': 'application/vnd.ipfs.ipns-record' } });
  };
  const result = await updatePointer({ cid, key: h.key, name: h.name, context, fetcher, delay: noDelay });
  assert.equal(result.previousCid, older);
  assert.ok(BigInt(result.sequence) > 1n);
  assert.equal(new Set(fetched).size, fetched.length);
  assert.ok(fetched.every(url => new URL(url).searchParams.has('verification')));
});
test('raw network failures and authentication responses do not escape as diagnostics', async () => {
  const fetcher = async () => { throw Error('DO_NOT_LOG_THIS_SENTINEL'); };
  await assert.rejects(assertFreshHead(context, fetcher, noDelay), error => error instanceof PublishError && error.message === 'NETWORK_REQUEST_FAILED' && !String(error).includes('SENTINEL'));
  await assert.rejects(assertFreshHead(context, async () => new Response('DO_NOT_LOG_THIS_SENTINEL', { status: 403 }), noDelay), { code: 'GITHUB_HEAD_READ_FAILED', status: 403 });
});
test('timer cannot advance IPNS when the Pages content is from another release', async () => {
  await assert.rejects(verifyPages(manifest, async () => new Response('old release'), noDelay), { code: 'PAGES_RELEASE_NOT_VERIFIED' });
  await verifyPages(manifest, async url => new Response(files.get(new URL(url).pathname.slice(1))), noDelay);
});
test('keepalive leaves active repositories alone and preserves the exact tree when idle', async () => {
  for (const idleDays of [5, 45]) {
    const calls = [], now = Date.now(), tree = 'd'.repeat(40);
    const fetcher = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/commits/main')) return Response.json({ sha: context.sha, commit: { committer: { date: new Date(now - idleDays * 86400000).toISOString() }, tree: { sha: tree } } });
      if (url.endsWith('/git/commits')) { const body = JSON.parse(options.body); assert.equal(body.tree, tree); assert.deepEqual(body.parents, [context.sha]); return Response.json({ sha: 'e'.repeat(40) }); }
      assert.equal(JSON.parse(options.body).force, false); return Response.json({});
    };
    assert.equal(await keepSchedule({ token: 'test', event: 'schedule', ref: context.ref, fetcher, now: () => now }), idleDays < 40 ? 'not_needed' : 'empty_commit_created');
    assert.equal(calls.length, idleDays < 40 ? 1 : 3);
  }
});
test('an IPNS record signed by another identity cannot affect sequence or destination', async () => {
  const unrelated = await generateKeyPair('Ed25519');
  const record = marshalIPNSRecord(await createIPNSRecord(unrelated, `/ipfs/${older}`, 999999999999999999n, 3_600_000));
  const h = await harness({ previous: record });
  await assert.rejects(release(h.args), { code: 'INVALID_IPNS_RECORD' });
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
});
test('initial routing response with another media type means no record, while malformed typed records block publication', async () => {
  const h = await harness({ emptyRecord200: true });
  await release(h.args);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(h.stages.at(-1).state, 'published');
  const malformed = await harness({ previous: new Uint8Array([0xff]) });
  await assert.rejects(release(malformed.args), { code: 'INVALID_IPNS_RECORD' });
  assert.equal(malformed.calls.filter(call => call.method === 'PUT').length, 0);
});
test('Pinata rejections distinguish plan, scope and storage failures without exposing response bodies', async () => {
  for (const [body, code] of [
    ['CAR uploads require a paid plan. DO_NOT_LOG_THIS_SENTINEL', 'PINATA_CAR_PLAN_RESTRICTION'],
    ['Missing org:files:write permission. DO_NOT_LOG_THIS_SENTINEL', 'PINATA_UPLOAD_PERMISSION_MISSING'],
    ['Storage limit exceeded. DO_NOT_LOG_THIS_SENTINEL', 'PINATA_STORAGE_LIMIT'],
    ['Forbidden. DO_NOT_LOG_THIS_SENTINEL', 'PINATA_UPLOAD_FAILED'],
  ]) await assert.rejects(uploadFailure(new Response(body, { status: 403 })), error => error.code === code && !String(error).includes('SENTINEL'));
});
test('preferred public gateway verifies exact bytes when shared gateways are throttled', async () => {
  const origin = 'https://portfolio.mypinata.cloud';
  const fetcher = async url => url.startsWith(origin) ? new Response(files.get(url.split('/').at(-1))) : new Response(null, { status: 429 });
  assert.equal(await verifyGateway(cid, manifest, fetcher, noDelay, origin), origin);
  const credentialUrl = new URL(origin); credentialUrl.username = 'test'; credentialUrl.password = 'test';
  for (const invalid of ['http://portfolio.mypinata.cloud', credentialUrl.href, 'https://portfolio.mypinata.cloud/private', 'https://portfolio.mypinata.cloud?token=test']) assert.throws(() => gatewayOrigins(invalid), { code: 'INVALID_GATEWAY_ORIGIN' });
});
test('gateway directory index fallback must still match the reviewed HTML exactly', async () => {
  const origin = 'https://portfolio.mypinata.cloud';
  for (const corrupted of [false, true]) {
    const fetcher = async url => {
      if (!url.startsWith(origin) || url.endsWith('/index.html')) return new Response(null, { status: 403 });
      return new Response(url.endsWith('/') ? corrupted ? 'wrong homepage' : files.get('index.html') : files.get('styles.css'));
    };
    if (corrupted) await assert.rejects(verifyGateway(cid, manifest, fetcher, noDelay, origin), { code: 'PUBLIC_GATEWAY_NOT_VERIFIED' });
    else assert.equal(await verifyGateway(cid, manifest, fetcher, noDelay, origin), origin);
  }
});
test('gateway verification retries transient cold-pin failures with bounded backoff and no credentials', async () => {
  const origin = 'https://portfolio.mypinata.cloud';
  const pauses = [], reports = [];
  let preferredReads = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.headers, undefined);
    if (!url.startsWith(origin)) return new Response(null, { status: 429 });
    preferredReads++;
    if (preferredReads === 1) return new Response(null, { status: 504 });
    return new Response(files.get(url.split('/').at(-1)));
  };
  assert.equal(await verifyGateway(cid, manifest, fetcher, async ms => pauses.push(ms), origin, async checks => reports.push(checks)), origin);
  assert.deepEqual(pauses, [15000]);
  assert.equal(reports.length, 2);
  assert.ok(reports[0].some(check => check.httpStatus === 504 && check.code === 'HTTP_ERROR'));
  assert.ok(reports.at(-1).some(check => check.file === 'styles.css' && check.code === 'VERIFIED'));
});
test('persistent throttling is bounded and preserved as sanitized per-gateway diagnostics', async () => {
  const reports = [], pauses = [], calls = [];
  const fetcher = async url => { calls.push(url); return new Response('DO_NOT_LOG_THIS_SENTINEL', { status: 429 }); };
  await assert.rejects(verifyGateway(cid, manifest, fetcher, async ms => pauses.push(ms), undefined, async checks => reports.push(checks)), { code: 'PUBLIC_GATEWAY_NOT_VERIFIED' });
  assert.deepEqual(pauses, [15000, 30000]);
  assert.equal(calls.length, 6);
  assert.equal(reports.at(-1).length, 6);
  assert.ok(reports.at(-1).every(check => check.httpStatus === 429 && check.code === 'HTTP_ERROR'));
  assert.ok(!JSON.stringify(reports).includes('SENTINEL'));
});
test('HTTP 200 with incorrect bytes cannot publish and records a fixed mismatch code', async () => {
  const h = await harness({ pinned: true });
  const original = h.args.fetcher;
  await assert.rejects(release({ ...h.args, fetcher: (url, options) => url.includes('/ipfs/') ? new Response('DO_NOT_LOG_THIS_SENTINEL') : original(url, options) }), { code: 'PUBLIC_GATEWAY_NOT_VERIFIED' });
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  const checks = h.stages.at(-1).gatewayChecks;
  assert.ok(checks.every(check => check.httpStatus === 200 && check.code === 'CONTENT_MISMATCH'));
  assert.ok(!JSON.stringify(checks).includes('SENTINEL'));
});
test('gateway token is sent only to the configured Pinata origin and authenticated redirects are rejected', async () => {
  const origin = 'https://portfolio.mypinata.cloud';
  const token = 'synthetic-gateway-token';
  const reports = [], seen = [];
  const fetcher = async (url, options) => {
    seen.push(url);
    if (url.startsWith(origin)) {
      assert.equal(options.headers['x-pinata-gateway-token'], token);
      assert.equal(options.redirect, 'error');
      return new Response(files.get(url.split('/').at(-1)));
    }
    assert.equal(options.headers, undefined);
    return new Response(null, { status: 429 });
  };
  assert.equal(await verifyGateway(cid, manifest, fetcher, noDelay, origin, async checks => reports.push(checks), token), origin);
  assert.ok(seen.some(url => url.startsWith('https://ipfs.io')));
  assert.ok(!JSON.stringify(reports).includes(token));
  for (const invalid of [undefined, 'https://example.com', 'https://portfolio.mypinata.cloud.example.com']) assert.throws(() => gatewayAccess(invalid, token), { code: 'INVALID_AUTHENTICATED_GATEWAY' });
  const h = await harness();
  await assert.rejects(release({ ...h.args, preferredGateway: 'https://example.com', gatewayToken: token }), { code: 'INVALID_AUTHENTICATED_GATEWAY' });
  assert.equal(h.calls.length, 0);
});
test('authenticated Pinata HTML download fallback still requires exact homepage and stylesheet bytes', async () => {
  const origin = 'https://portfolio.mypinata.cloud';
  for (const corrupted of [false, true]) {
    const fetcher = async (url, options) => {
      if (!url.startsWith(origin)) return new Response(null, { status: 429 });
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['x-pinata-gateway-token'], 'synthetic-gateway-token');
      const u = new URL(url);
      if (u.pathname.endsWith('styles.css')) return new Response(files.get('styles.css'));
      if (u.searchParams.get('download') === 'true') return new Response(corrupted ? 'wrong homepage' : files.get('index.html'));
      return new Response(null, { status: 403 });
    };
    const check = verifyGateway(cid, manifest, fetcher, noDelay, origin, undefined, 'synthetic-gateway-token');
    if (corrupted) await assert.rejects(check, { code: 'PUBLIC_GATEWAY_NOT_VERIFIED' });
    else assert.equal(await check, origin);
  }
});
test('provider rejection bodies become fixed categories without leaking their text', async () => {
  for (const [body, code] of [
    ['HTML file type is blocked. DO_NOT_LOG_THIS_SENTINEL', 'GATEWAY_CONTENT_TYPE_RESTRICTED'],
    ['Cloudflare challenge-platform DO_NOT_LOG_THIS_SENTINEL', 'GATEWAY_EDGE_REJECTION'],
    ['Bandwidth quota reached. DO_NOT_LOG_THIS_SENTINEL', 'GATEWAY_PLAN_LIMIT'],
    ['Invalid gateway token. DO_NOT_LOG_THIS_SENTINEL', 'GATEWAY_ACCESS_DENIED'],
    ['Unknown response DO_NOT_LOG_THIS_SENTINEL', 'HTTP_ERROR'],
    ['Cannot serve this content on a gateway subdomain. Please add a custom domain. DO_NOT_LOG_THIS_SENTINEL', 'GATEWAY_CUSTOM_DOMAIN_REQUIRED'],
  ]) assert.equal(await gatewayFailure(new Response(body, { status: 403 })), code);
});
test('custom-domain requirement fails without retrying the provider or updating IPNS', async () => {
  const h = await harness({ pinned: true });
  const origin = 'https://portfolio.mypinata.cloud';
  const original = h.args.fetcher, pauses = [], requests = [];
  const fetcher = async (url, options) => {
    if (!url.includes('/ipfs/')) return original(url, options);
    requests.push(url);
    if (!url.startsWith(origin)) return new Response(null, { status: 429 });
    if (url.endsWith('/styles.css')) return new Response(files.get('styles.css'));
    return new Response('Cannot serve this content. Please add a custom domain to this gateway.', { status: 403 });
  };
  await assert.rejects(release({ ...h.args, fetcher, delay: async ms => pauses.push(ms), preferredGateway: origin, gatewayToken: 'synthetic-gateway-token' }), { code: 'GATEWAY_CUSTOM_DOMAIN_REQUIRED', status: 403 });
  assert.deepEqual(pauses, []);
  assert.equal(requests.filter(url => url.startsWith(origin)).length, 2);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
});
test('public gateway fallbacks do not duplicate the same backend and rate limit', () => {
  assert.deepEqual(gatewayOrigins(), ['https://ipfs.io']);
  assert.deepEqual(gatewayOrigins('https://dweb.link'), ['https://dweb.link']);
  assert.deepEqual(gatewayOrigins('https://portfolio.mypinata.cloud'), ['https://portfolio.mypinata.cloud', 'https://ipfs.io']);
});

test('remote CAR verification uses fresh offline storage and rejects corrupt, missing and mismatched content', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'portfolio-car-test-'));
  const env = { PATH: process.env.PATH, HOME: directory, IPFS_PATH: resolve(directory, 'builder') };
  const command = promisify(execFile), binary = process.env.IPFS_BINARY || 'ipfs';
  try {
    await mkdir(resolve(directory, 'site'));
    for (const [name, bytes] of files) await writeFile(resolve(directory, 'site', name), bytes);
    await command(binary, ['init', '--profile=server'], { env, timeout: 30_000 });
    const added = await command(binary, ['add', '--offline', '-r', '--cid-version=1', '--raw-leaves=true', '--pin=false', '-Q', resolve(directory, 'site')], { env, timeout: 30_000 });
    const root = added.stdout.trim();
    const { stdout: car } = await command(binary, ['dag', 'export', '--offline', root], { env, timeout: 30_000, encoding: 'buffer' });
    verifyCarBlocks(car);
    await verifyCarArchive(root, manifest, car);
    const corrupt = Buffer.from(car); corrupt[corrupt.length - 1] ^= 1;
    assert.throws(() => verifyCarBlocks(corrupt), { code: 'INVALID_GATEWAY_CAR' });
    assert.throws(() => verifyCarBlocks(car.subarray(0, car.length - 1)), { code: 'INVALID_GATEWAY_CAR' });
    await assert.rejects(verifyCarArchive(older, manifest, car), { code: 'GATEWAY_CAR_NOT_VERIFIED' });
    const wrongManifest = { ...manifest, files: manifest.files.map(file => file.name === 'styles.css' ? { ...file, sha256: '0'.repeat(64) } : file) };
    await assert.rejects(verifyCarArchive(root, wrongManifest, car), { code: 'CONTENT_MISMATCH' });
    const { stdout: incomplete } = await command(binary, ['dag', 'export', '--offline', `${root}/index.html`], { env, timeout: 30_000, encoding: 'buffer' });
    await assert.rejects(verifyCarArchive(root, manifest, incomplete), { code: 'GATEWAY_CAR_NOT_VERIFIED' });

    const origin = 'https://ipfs.orbitor.dev', checks = [];
    const fetcher = async (url, options) => {
      assert.deepEqual(options.headers, { Accept: 'application/vnd.ipld.car' });
      assert.equal(options.redirect, 'follow');
      if (!url.startsWith(origin)) return new Response(null, { status: 429 });
      assert.equal(url, `${origin}/ipfs/${root}?format=car&dag-scope=all`);
      return new Response(car, { headers: { 'Content-Type': 'application/vnd.ipld.car; version=1' } });
    };
    assert.equal(await verifyCarGateway(root, manifest, fetcher, noDelay, origin, async rows => checks.push(...rows)), origin);
    assert.ok(checks.some(row => row.gateway === origin && row.code === 'VERIFIED'));
    const success = await harness({ pinned: true, cid: root });
    const originalSuccess = success.args.fetcher;
    await release({ ...success.args, gatewayFormat: 'car', preferredGateway: origin, fetcher: (url, options) => url.includes('/ipfs/') ? fetcher(url, options) : originalSuccess(url, options) });
    assert.equal(unmarshalIPNSRecord(success.current()).value, `/ipfs/${root}`);
    assert.equal(success.stages.find(stage => stage.state === 'verified').gatewayFormat, 'car');

    // A valid archive for another root, an altered block, or HTML masquerading
    // as a CAR must all stop the release before any IPNS PUT.
    for (const [body, type] of [[car, 'application/vnd.ipld.car'], [corrupt, 'application/vnd.ipld.car'], [Buffer.from('<html>CDN page</html>'), 'text/html']]) {
      const h = await harness({ pinned: true });
      const original = h.args.fetcher;
      const fetcher = (url, options) => url.includes('/ipfs/')
        ? new Response(body, { headers: { 'Content-Type': type } }) : original(url, options);
      await assert.rejects(release({ ...h.args, gatewayFormat: 'car', preferredGateway: origin, fetcher }), { code: 'PUBLIC_GATEWAY_NOT_VERIFIED' });
      assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
