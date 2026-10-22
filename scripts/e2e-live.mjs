// Manual live-service check. Pass the root of an installed filepizza-cli package.
// Only a generated public fixture is shared; cleanup always requests CLI stop.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const packageRoot = resolve(process.argv[2] ?? '.');
const cli = join(packageRoot, 'dist/cli.js');
const { createPeerFromIce, waitForPeerOpen } = await import(pathToFileURL(join(packageRoot, 'dist/node-peer.js')));
const { FilePizzaApi } = await import(pathToFileURL(join(packageRoot, 'dist/filepizza-api.js')));
const home = await mkdtemp(join(tmpdir(), 'filepizza-e2e-'));
const file = join(home, 'fixture.txt');
const expected = Buffer.from('FilePizza public E2E fixture. No private data.\n'.repeat(8192));
await writeFile(file, expected);
let uploadId;
let peer;
let resultCode = 0;

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--json'], {
    env: { ...process.env, FILEPIZZA_CLI_HOME: home },
    encoding: 'utf8', timeout: 60000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

try {
  const manifest = run('share', file, '--timeout', '35', '--request-timeout', '10');
  uploadId = manifest.uploadId;
  assert.ok(uploadId && manifest.peerId);
  assert.equal(run('status', uploadId).alive, true);
  const api = new FilePizzaApi({ timeoutMs: 10000 });
  peer = await createPeerFromIce(await api.getIceConfig());
  // The data connection handles transfer errors; avoid an unhandled peer event.
  peer.on('error', () => {});
  await waitForPeerOpen(peer, { timeoutMs: 15000 });
  const connection = peer.connect(manifest.peerId, { reliable: true });
  const chunks = [];
  const downloaded = await new Promise((resolveTransfer, reject) => {
    const timer = setTimeout(() => reject(new Error('Receiver transfer timed out')), 30000);
    const fail = error => { clearTimeout(timer); reject(error); };
    connection.on('error', fail);
    connection.on('data', message => {
      try {
        if (message.type === 'Info') {
          assert.equal(message.files[0].fileName, 'fixture.txt');
          assert.equal(message.files[0].size, expected.length);
          connection.send({ type: 'Start', fileName: 'fixture.txt', offset: 0 });
        } else if (message.type === 'Chunk') {
          chunks.push(Buffer.from(message.bytes));
          if (message.final) {
            connection.send({ type: 'Done' });
            clearTimeout(timer);
            resolveTransfer(Buffer.concat(chunks));
          }
        } else if (message.type === 'Error') fail(new Error(message.error));
      } catch (error) { fail(error); }
    });
    connection.on('open', () => {
      try {
        connection.send({
          type: 'RequestInfo', browserName: 'CLI-E2E', browserVersion: '1',
          osName: 'test', osVersion: '1', mobileVendor: '', mobileModel: '',
        });
      } catch (error) { fail(error); }
    });
  });
  assert.deepEqual(downloaded, expected);
  assert.ok(chunks.length > 1, 'fixture should exercise multiple data frames');
  console.log(JSON.stringify({ ok: true, bytes: downloaded.length, chunks: chunks.length,
    sha256: createHash('sha256').update(downloaded).digest('hex') }));
} catch (error) {
  resultCode = 1;
  console.error(error.message);
} finally {
  try { peer?.destroy(); } catch (error) {
    resultCode = 1;
    console.error(`Receiver shutdown failed: ${error.message}`);
  }
  try {
    // A startup timeout can leave a worker running. Discover its ID for cleanup.
    if (!uploadId) {
      const records = await readdir(join(home, '.cache/filepizza-cli/uploads')).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      uploadId = records.find(name => name.endsWith('.json'))?.slice(0, -5);
    }
    if (uploadId) {
      run('stop', uploadId);
      const deadline = Date.now() + 20000;
      while (run('status', uploadId).alive) {
        assert.ok(Date.now() < deadline, 'worker did not exit after stop');
        await delay(100);
      }
    }
    await rm(home, { recursive: true, force: true });
  } catch (error) {
    resultCode = 1;
    console.error(`Cleanup failed: ${error.message}; state retained at ${home}`);
  }
}
// Native WebRTC bindings can retain handles after peer.destroy().
process.exit(resultCode);
