// One-time operator command. Private key bytes never enter arguments or logs.
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { base36 } from 'multiformats/bases/base36';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const repository = 'ethduke/ethduke.github.io';
const environment = 'ipfs-publish';
const keyName = 'portfolio-ethduke-github';
function gh(args, data) {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = []; child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.resume(); child.on('error', reject);
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on('close', code => { clearTimeout(timer); code ? reject(Error('GITHUB_SETUP_FAILED')) : resolve(Buffer.concat(output).toString()); });
    child.stdin.end(data);
  });
}
try {
  const configFile = new URL('../publish.config.json', import.meta.url);
  try { await readFile(configFile); throw Error('ALREADY_CONFIGURED'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const local = async (command, body) => {
    const response = await fetch(`http://127.0.0.1:5001/api/v0/${command}`, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw Error('LOCAL_KEY_BACKUP_FAILED');
    return response.json();
  };
  const existing = await local('key/ls');
  if (existing.Keys.some(key => key.Name === keyName)) throw Error('BACKUP_EXISTS');
  await gh(['api', '--method', 'PUT', `repos/${repository}/environments/${environment}`, '--input', '-'], JSON.stringify({ deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }));
  await gh(['api', '--method', 'POST', `repos/${repository}/environments/${environment}/deployment-branch-policies`, '--input', '-'], JSON.stringify({ name: 'main', type: 'branch' }));
  const key = await generateKeyPair('Ed25519');
  const secret = Buffer.from(privateKeyToProtobuf(key));
  const name = key.publicKey.toCID().toString(base36);
  const form = new FormData(); form.append('file', new Blob([secret]), 'portfolio-ipns');
  const backup = await local(`key/import?arg=${keyName}&format=libp2p-protobuf-cleartext&ipns-base=base36`, form);
  if (backup.Id !== name) throw Error('KEY_ID_MISMATCH');
  await gh(['secret', 'set', 'IPNS_PRIVATE_KEY', '--repo', repository, '--env', environment], secret.toString('base64'));
  secret.fill(0);
  await writeFile(configFile, JSON.stringify({ repository, branch: 'main', ipnsName: name, environment, localBackupKey: keyName }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Shared IPNS address: ipns://${name}`);
  console.log('Dedicated key backed up in the local Kubo keystore and stored in the GitHub environment secret.');
} catch (error) {
  console.error(['ALREADY_CONFIGURED', 'BACKUP_EXISTS'].includes(error.message) ? error.message : 'IPNS_SETUP_FAILED');
  process.exitCode = 1;
}
