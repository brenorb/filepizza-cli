// Use as src/worker.ts only in a disposable checkout of the 0.1.0 release.
import { spawnSync } from "node:child_process";
import { UploadStore } from "./upload-store.js";

const args = process.argv.slice(2);
const uploadId = args[args.indexOf("--upload-id") + 1];
const filePath = args[args.indexOf("--file") + 1];
const ended = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
if (ended.status !== 0 || !ended.pid) throw new Error("Could not create the exited-worker fixture");

await new UploadStore().write({
  ok: true, uploadId, filePath, fileName: "fixture.txt", pid: ended.pid,
  status: "seeding", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  shortUrl: "https://file.invalid/short", longUrl: "https://file.invalid/long",
});
