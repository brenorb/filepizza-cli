import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UploadStore, materializeManifestStatus } from "../src/upload-store.js";

describe("UploadStore", () => {
  it("writes and reads manifests from the upload cache", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "filepizza-cli-store-"));
    const store = new UploadStore(rootDir);

    await store.write({
      ok: true,
      uploadId: "upload-1",
      filePath: "/tmp/sample.txt",
      fileName: "sample.txt",
      pid: process.pid,
      status: "seeding",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const manifest = materializeManifestStatus(await store.read("upload-1"));

    expect(manifest.fileName).toBe("sample.txt");
    expect(manifest.alive).toBe(true);
  });
});
