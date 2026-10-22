import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { runBackgroundWorker } from "../src/worker-runtime.js";
import { UploadStore, type UploadManifest } from "../src/upload-store.js";

it("a private stop marker cancels startup without signalling a PID", async () => {
  const root = await mkdtemp(join(tmpdir(), "pizza-worker-"));
  try {
    const store = new UploadStore(root);
    await store.requestStop("sample");
    let cancelled = false;
    const service = { startUpload: vi.fn(async (options: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      const abort = () => { cancelled = true; reject(options.signal.reason); };
      if (options.signal.aborted) abort(); else options.signal.addEventListener("abort", abort, { once: true });
    })) };
    expect(await runBackgroundWorker({ store, service, uploadId: "sample", filePath: "/tmp/demo.txt", pollMs: 1 })).toBe(0);
    expect(cancelled).toBe(true);
    expect(await store.isStopRequested("sample")).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("a running worker honors a stop marker and records shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "pizza-worker-"));
  try {
    const store = new UploadStore(root);
    const manifest: UploadManifest = { ok: true, uploadId: "sample", filePath: "/tmp/demo.txt", fileName: "demo.txt", pid: process.pid, controlVersion: 1, status: "seeding", startedAt: "2026", updatedAt: "2026" };
    const stop = vi.fn(async () => { const stopped = { ...manifest, status: "stopped" as const }; await store.write(stopped); return stopped; });
    const service = { startUpload: vi.fn(async () => { await store.write(manifest); return { manifest, stop }; }) };
    const running = runBackgroundWorker({ store, service, uploadId: "sample", filePath: "/tmp/demo.txt", pollMs: 1 });
    await vi.waitFor(() => expect(service.startUpload).toHaveBeenCalled());
    await store.requestStop("sample");
    expect(await running).toBe(0); expect(stop).toHaveBeenCalledOnce();
    expect((await store.read("sample")).status).toBe("stopped");
  } finally { await rm(root, { recursive: true, force: true }); }
});
