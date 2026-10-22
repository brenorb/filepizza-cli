import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UploadStore, type UploadManifest } from "../src/upload-store.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "filepizza-store-contract-")); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const entry: UploadManifest = { ok: true, uploadId: "upload-1", filePath: "/tmp/book.pdf", fileName: "book.pdf", status: "seeding", startedAt: "2026-10-22", updatedAt: "2026-10-22", secret: "private" };

it("honors XDG_CACHE_HOME without changing the legacy explicit home override", () => {
  vi.stubEnv("FILEPIZZA_CLI_HOME", "");
  vi.stubEnv("XDG_CACHE_HOME", root);
  expect(new UploadStore().rootDir).toBe(join(root, "filepizza-cli"));
  vi.stubEnv("FILEPIZZA_CLI_HOME", root);
  expect(new UploadStore().rootDir).toBe(join(root, ".cache", "filepizza-cli"));
});

it("protects secret-bearing state files and directories", async () => {
  const store = new UploadStore(root);
  await store.write(entry);
  if (process.platform !== "win32") {
    expect((await stat(store.manifestPath(entry.uploadId))).mode & 0o777).toBe(0o600);
    expect((await stat(store.uploadsDir)).mode & 0o777).toBe(0o700);
  }
});

it("validates identifiers before touching the filesystem", async () => {
  const store = new UploadStore(root);
  await expect(store.read("../../outside")).rejects.toThrow("Invalid upload ID");
  await expect(store.write({ ...entry, uploadId: "../outside" })).rejects.toThrow("Invalid upload ID");
});

it("reports corrupt state with a recovery path", async () => {
  const store = new UploadStore(root);
  await store.write(entry);
  await writeFile(store.manifestPath(entry.uploadId), "{}");
  await expect(store.read(entry.uploadId)).rejects.toThrow(/Invalid upload manifest.*restore/i);
});

it("readers never observe partially written JSON", async () => {
  const store = new UploadStore(root);
  await store.write(entry);
  await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    await store.write({ ...entry, fileName: `book-${index}.pdf` });
    const raw = await readFile(store.manifestPath(entry.uploadId), "utf8");
    expect(JSON.parse(raw)).toHaveProperty("uploadId", entry.uploadId);
  }));
});

it("ignores relative XDG cache paths", () => {
  vi.stubEnv("FILEPIZZA_CLI_HOME", "");
  vi.stubEnv("XDG_CACHE_HOME", "relative-cache");
  expect(new UploadStore().rootDir.startsWith("relative-cache")).toBe(false);
});

it("rejects malformed optional manifest fields", async () => {
  const store = new UploadStore(root);
  await store.write(entry);
  for (const value of [{ shortUrl: {} }, { error: 42 }, { pid: 2 ** 40 }]) {
    await writeFile(store.manifestPath(entry.uploadId), JSON.stringify({ ...entry, ...value }));
    await expect(store.read(entry.uploadId)).rejects.toThrow(/Invalid upload manifest.*restore/i);
  }
});
