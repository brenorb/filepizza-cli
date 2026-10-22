import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { startShare, stopShare } from "../src/lifecycle.js";
import type { UploadManifest } from "../src/upload-store.js";

const entry: UploadManifest = { ok: true, uploadId: "upload-1", filePath: "/tmp/demo.txt", fileName: "demo.txt", status: "seeding", pid: process.pid, startedAt: "2026", updatedAt: "2026", shortUrl: "https://file.pizza/x", longUrl: "https://file.pizza/y", controlVersion: 1 };
class Worker extends EventEmitter { unref() {} }
const store = (value = entry) => ({ read: vi.fn().mockResolvedValue(value), requestStop: vi.fn().mockResolvedValue(undefined) });

describe("cooperative lifecycle", () => {
  it("returns a live ready share", async () => {
    const cache = store();
    expect(await startShare(cache, entry.uploadId, () => new Worker(), 100)).toMatchObject({ status: "seeding" });
  });
  it("never reports a dead or terminal seeder as ready", async () => {
    await expect(startShare(store({ ...entry, status: "stopped" }), entry.uploadId, () => new Worker(), 100)).rejects.toThrow(/stopped/);
  });
  it("surfaces worker spawn failure immediately", async () => {
    const child = new Worker();
    const cache = { ...store(), read: vi.fn().mockRejectedValue(new Error("Unknown upload_id: upload-1")) };
    const pending = startShare(cache, entry.uploadId, () => { queueMicrotask(() => child.emit("error", new Error("spawn denied"))); return child; }, 10000);
    await expect(pending).rejects.toThrow(/spawn denied/);
  });
  it("cancellation requests safe cooperative shutdown and returns promptly", async () => {
    const controller = new AbortController();
    const cache = { ...store(), read: vi.fn().mockRejectedValue(new Error("Unknown upload_id: upload-1")) };
    const pending = startShare(cache, entry.uploadId, () => new Worker(), 10000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/interrupted.*upload-1/);
    expect(cache.requestStop).toHaveBeenCalledWith(entry.uploadId);
  });
  it("timeout retains the share and reports recoverable commands", async () => {
    const cache = { ...store(), read: vi.fn().mockRejectedValue(new Error("Unknown upload_id: upload-1")) };
    await expect(startShare(cache, entry.uploadId, () => new Worker(), 5)).rejects.toThrow(/upload-1.*status.*stop/);
    expect(cache.requestStop).not.toHaveBeenCalled();
  });
  it("does not touch a terminal upload or signal a stored PID", async () => {
    const cache = store({ ...entry, status: "stopped", controlVersion: undefined });
    expect(await stopShare(cache, entry.uploadId, 10)).toMatchObject({ status: "stopped" });
    expect(cache.requestStop).not.toHaveBeenCalled();
  });
  it("refuses to signal legacy active workers", async () => {
    await expect(stopShare(store({ ...entry, controlVersion: undefined }), entry.uploadId, 10)).rejects.toThrow(/older worker.*inspect/);
  });
  it("requests a control marker and waits for stopped state", async () => {
    const cache = store();
    cache.read.mockResolvedValueOnce(entry).mockResolvedValue({ ...entry, status: "stopped" });
    expect(await stopShare(cache, entry.uploadId, 100)).toMatchObject({ status: "stopped" });
    expect(cache.requestStop).toHaveBeenCalledWith(entry.uploadId);
  });
});
