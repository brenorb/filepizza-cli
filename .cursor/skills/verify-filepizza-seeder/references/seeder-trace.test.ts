import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { SeederService } from "../src/seeder-service.js";
import { UploadStore } from "../src/upload-store.js";

it("replays the in-flight seeding write after peer cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "pizza-seeder-trace-"));
  const store = new UploadStore(root);
  const save = store.write.bind(store);
  const seedingEntered = Promise.withResolvers<void>();
  const releaseSeeding = Promise.withResolvers<void>();
  const terminalSaved = Promise.withResolvers<void>();
  const peer = Object.assign(new EventEmitter(), { id: "local-test-peer", destroy: vi.fn() });
  vi.spyOn(store, "write").mockImplementation(async manifest => {
    if (manifest.status === "seeding") {
      seedingEntered.resolve();
      await releaseSeeding.promise;
    }
    await save(manifest);
    if (manifest.status === "error") terminalSaved.resolve();
  });
  const service = new SeederService({
    store,
    createPeer: async () => peer,
    createUploadFile: async () => ({
      filePath: "/fixture.txt", fileName: "fixture.txt", size: 1, type: "text/plain",
      readRange: async () => Uint8Array.of(0), dispose: async () => {},
    }),
    api: {
      getIceConfig: async () => ({ host: "test", path: "/", iceServers: [] }),
      createChannel: async () => ({ shortSlug: "short", longSlug: "long", uploaderPeerID: peer.id }),
      renewChannel: async () => true,
      destroyChannel: async () => true,
      channelUrl: slug => `https://file.invalid/${slug}`,
    },
  });
  try {
    const start = service.startUpload({ uploadId: "test", filePath: "/fixture.txt" });
    await seedingEntered.promise;
    peer.emit("error", new Error("local fixture lost connection"));
    await terminalSaved.promise;
    expect(peer.destroy).toHaveBeenCalledOnce();
    expect((await store.read("test")).status).toBe("error");
    releaseSeeding.resolve();
    const result = await start;
    expect(result.manifest.status).toBe("error");
    expect((await store.read("test")).status).toBe("seeding");
  } finally {
    releaseSeeding.resolve();
    await rm(root, { recursive: true, force: true });
  }
});
