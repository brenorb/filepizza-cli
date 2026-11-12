import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { UploadStore, type UploadManifest } from "../src/upload-store.js";

const stagedWrite = vi.hoisted(() => ({
  active: false,
  opened: () => {},
  release: Promise.resolve(),
}));

vi.mock("node:fs/promises", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  const writeFile: typeof fs.writeFile = async (file, data, options) => {
    if (!stagedWrite.active) return fs.writeFile(file, data, options);
    await fs.writeFile(file, "", options);
    stagedWrite.opened();
    await stagedWrite.release;
    return fs.writeFile(file, data, "utf8");
  };
  return { ...fs, writeFile };
});

it("keeps the previous record visible while the new bytes are incomplete", async () => {
  const root = await mkdtemp(join(tmpdir(), "filepizza-manifest-trace-"));
  const store = new UploadStore(root);
  const manifest: UploadManifest = {
    ok: true, uploadId: "fixture", fileName: "old.txt", filePath: "/fixture.txt",
    status: "starting", startedAt: "2026", updatedAt: "2026",
  };
  const opened = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let writing: Promise<void> | undefined;
  try {
    await store.write(manifest);
    stagedWrite.active = true;
    stagedWrite.opened = opened.resolve;
    stagedWrite.release = release.promise;
    writing = store.write({ ...manifest, fileName: "new.txt" });
    await opened.promise;
    await expect(store.read("fixture")).resolves.toMatchObject({ fileName: "old.txt" });
  } finally {
    stagedWrite.active = false;
    release.resolve();
    try {
      await writing;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
