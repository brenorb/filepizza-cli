import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { MessageType } from "../src/messages.js";
import { SeederService } from "../src/seeder-service.js";
import { UploadStore } from "../src/upload-store.js";

class FakePeer extends EventEmitter {
  constructor(public id = "peer-1") {
    super();
  }

  destroyed = false;

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeConnection extends EventEmitter {
  readonly sent: unknown[] = [];

  send(payload: unknown): void {
    this.sent.push(payload);
  }

  close(): void {}
}

describe("SeederService", () => {
  it("creates a shareable upload manifest and responds to downloader metadata requests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "filepizza-cli-test-"));
    const store = new UploadStore(rootDir);
    const peer = new FakePeer();
    const service = new SeederService({
      store,
      renewIntervalMs: 60_000,
      api: {
        async getIceConfig() {
          return { host: "0.peerjs.com", path: "/", iceServers: [] };
        },
        async createChannel(uploaderPeerID: string) {
          return {
            secret: "secret-1",
            longSlug: "basil/olive",
            shortSlug: "abcd1234",
            uploaderPeerID,
          };
        },
        async renewChannel() {
          return true;
        },
        async destroyChannel() {
          return true;
        },
        channelUrl(slug: string) {
          return `https://file.pizza/download/${slug}`;
        },
      },
      async createPeer() {
        return peer;
      },
      async createUploadFile() {
        return {
          filePath: "/tmp/sample.txt",
          fileName: "sample.txt",
          size: 5,
          type: "text/plain",
          async readRange(offset: number, end: number) {
            return new Uint8Array(Buffer.from("hello").subarray(offset, end));
          },
          async dispose() {},
        };
      },
    });

    const started = await service.startUpload({
      uploadId: "upload-1",
      filePath: "/tmp/sample.txt",
    });

    expect(started.manifest.shortUrl).toBe("https://file.pizza/download/abcd1234");
    expect(started.manifest.longUrl).toBe("https://file.pizza/download/basil/olive");

    const connection = new FakeConnection();
    peer.emit("connection", connection);
    connection.emit("data", {
      type: MessageType.RequestInfo,
      browserName: "Chrome",
      browserVersion: "126",
      osName: "macOS",
      osVersion: "15",
      mobileVendor: "",
      mobileModel: "",
    });

    expect(connection.sent).toEqual([
      {
        type: MessageType.Info,
        files: [
          {
            fileName: "sample.txt",
            size: 5,
            type: "text/plain",
          },
        ],
      },
    ]);

    const stopped = await started.stop();
    expect(stopped.status).toBe("stopped");
    expect(peer.destroyed).toBe(true);
  });
});

