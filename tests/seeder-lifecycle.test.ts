import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SeederService } from "../src/seeder-service.js";
import { UploadStore } from "../src/upload-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pizza-lifecycle-")); roots.push(root);
  const peer = new EventEmitter() as EventEmitter & { id?: string; destroy: ReturnType<typeof vi.fn> };
  peer.id = "peer-1"; peer.destroy = vi.fn();
  const file = { filePath: "/tmp/demo.txt", fileName: "demo.txt", size: 1, type: "text/plain", readRange: async () => new Uint8Array(), dispose: vi.fn().mockResolvedValue(undefined) };
  const api = { getIceConfig: vi.fn().mockResolvedValue({ host: "peer", path: "/", iceServers: [] }), createChannel: vi.fn().mockResolvedValue({ shortSlug: "x", longSlug: "y", secret: "secret", uploaderPeerID: "peer-1" }), renewChannel: vi.fn().mockResolvedValue(true), destroyChannel: vi.fn().mockResolvedValue(true), channelUrl: (slug: string) => `https://file.pizza/${slug}` };
  const store = new UploadStore(root);
  return { store, peer, file, api, deps: { store, api, createPeer: async () => peer, createUploadFile: async () => file, shutdownTimeoutMs: 10, startupTimeoutMs: 20, renewIntervalMs: 1000 } };
}

it("bounds peer startup and removes listeners while cleaning resources", async () => {
  const f = await fixture(); f.peer.id = undefined;
  await expect(new SeederService(f.deps).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt" })).rejects.toThrow(/timed out/);
  expect(f.peer.destroy).toHaveBeenCalled(); expect(f.file.dispose).toHaveBeenCalled();
  expect(f.peer.listenerCount("open")).toBe(0);
  expect((await f.store.read("sample")).status).toBe("error");
});

it("cancels a hanging startup and records a stopped upload", async () => {
  const f = await fixture(); f.api.getIceConfig.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = new SeederService({ ...f.deps, startupTimeoutMs: 10000 }).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt", signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await expect(pending).rejects.toThrow();
  expect(f.file.dispose).toHaveBeenCalled();
  expect((await f.store.read("sample")).status).toBe("stopped");
});

it("shutdown stops local serving before a hung remote deletion and returns with a warning", async () => {
  const f = await fixture(); f.api.destroyChannel.mockImplementation(() => new Promise(() => {}));
  const started = await new SeederService(f.deps).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt" });
  const stopped = await started.stop();
  expect(f.peer.destroy).toHaveBeenCalled(); expect(f.file.dispose).toHaveBeenCalled();
  expect(stopped.status).toBe("stopped"); expect(stopped.warning).toMatch(/cleanup.*timed out/);
});

it("handles renewal failure without an unhandled rejection and records the failed share", async () => {
  const f = await fixture(); f.api.renewChannel.mockRejectedValue(new Error("renewal denied"));
  const started = await new SeederService({ ...f.deps, renewIntervalMs: 5 }).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt" });
  await vi.waitFor(async () => expect((await f.store.read("sample")).status).toBe("error"));
  expect((await f.store.read("sample")).error).toContain("renewal denied");
  expect(f.peer.destroy).toHaveBeenCalled(); await started.stop();
});

it("disposes a file handle which resolves after startup cancellation", async () => {
  const f = await fixture(); const controller = new AbortController();
  let finishFile!: (value: typeof f.file) => void;
  const createUploadFile = vi.fn(() => new Promise<typeof f.file>(resolve => { finishFile = resolve; }));
  const pending = new SeederService({ ...f.deps, createUploadFile, startupTimeoutMs: 10000 }).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt", signal: controller.signal });
  await vi.waitFor(() => expect(createUploadFile).toHaveBeenCalled());
  controller.abort(); await expect(pending).rejects.toThrow(); finishFile(f.file);
  await vi.waitFor(() => expect(f.file.dispose).toHaveBeenCalledOnce());
});

it("aborts remote cleanup when the shutdown deadline expires", async () => {
  const f = await fixture(); let cleanupSignal: AbortSignal | undefined;
  f.api.destroyChannel.mockImplementation((_slug: string, signal?: AbortSignal) => { cleanupSignal = signal; return new Promise(() => {}); });
  const started = await new SeederService(f.deps).startUpload({ uploadId: "sample", filePath: "/tmp/demo.txt" });
  await started.stop(); expect(cleanupSignal?.aborted).toBe(true);
});
