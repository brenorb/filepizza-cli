import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = resolve(process.argv[2] ?? "scripts/e2e-live.mjs");
const root = await mkdtemp(join(tmpdir(), "filepizza-live-check-fixture-"));

try {
  const dist = join(root, "dist");
  await mkdir(dist);
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(dist, "cli.js"), `
    import { existsSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    const marker = join(process.env.FILEPIZZA_CLI_HOME, "fixture-stopped");
    const command = process.argv[2];
    if (command === "share") console.log(JSON.stringify({ uploadId: "fixture", peerId: "peer" }));
    else if (command === "status") console.log(JSON.stringify({ alive: !existsSync(marker) }));
    else if (command === "stop") {
      writeFileSync(marker, "stopped");
      console.log("{}");
    } else process.exitCode = 2;
  `);
  await writeFile(join(dist, "filepizza-api.js"), `
    export class FilePizzaApi { async getIceConfig() { return {}; } }
  `);
  await writeFile(join(dist, "node-peer.js"), `
    import { EventEmitter } from "node:events";
    export const waitForPeerOpen = async () => "fake-recipient";
    export async function createPeerFromIce() {
      const peer = new EventEmitter();
      peer.destroy = () => {};
      peer.connect = () => {
        const connection = new EventEmitter();
        const data = Buffer.from("FilePizza public E2E fixture. No private data.\\n".repeat(8192));
        connection.send = message => {
          if (message.type === "RequestInfo") {
            queueMicrotask(() => connection.emit("data", {type: "Info", files: [{fileName: "fixture.txt", size: data.length}]}));
          }
          if (message.type === "Start") {
            if (process.env.FILEPIZZA_CHECK_CORRUPT === "1") data[0] ^= 1;
            queueMicrotask(() => {
              connection.emit("data", {type: "Chunk", bytes: data.subarray(0, 16), final: false});
              connection.emit("data", {type: "Chunk", bytes: data.subarray(16), final: true});
            });
          }
        };
        queueMicrotask(() => connection.emit("open"));
        return connection;
      };
      return peer;
    }
  `);

  const run = corrupt => spawnSync(process.execPath, [entry, root], {
    encoding: "utf8", timeout: 15_000,
    env: { ...process.env, FILEPIZZA_CHECK_CORRUPT: corrupt ? "1" : "0" },
  });
  const good = run(false);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).ok, true);
  const bad = run(true);
  assert.equal(bad.status, 1, "A one-byte mismatch must fail the live check");
  assert.equal(bad.stdout, "", "A mismatched transfer printed a success report");
  console.log("The live-check entrypoint accepted matching bytes and rejected mismatched bytes.");
} finally {
  await rm(root, { recursive: true, force: true });
}
