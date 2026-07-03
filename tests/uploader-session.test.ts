import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageType } from "../src/messages.js";
import { MAX_CHUNK_SIZE, UploaderSession, type UploadFile } from "../src/uploader-session.js";

class FakeConnection extends EventEmitter {
  readonly sent: unknown[] = [];
  closed = false;

  send(payload: unknown): void {
    this.sent.push(payload);
  }

  close(): void {
    this.closed = true;
  }
}

function createFile(size: number): UploadFile {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);

  return {
    fileName: "sample.bin",
    size: bytes.byteLength,
    type: "application/octet-stream",
    async readRange(offset: number, end: number): Promise<Uint8Array> {
      return bytes.slice(offset, end);
    },
  };
}

describe("UploaderSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("responds to RequestInfo with the available file list", async () => {
    const session = new UploaderSession({ files: [createFile(32)] });
    const connection = new FakeConnection();
    session.attach(connection);

    connection.emit("data", {
      type: MessageType.RequestInfo,
      browserName: "Chrome",
      browserVersion: "126",
      osName: "macOS",
      osVersion: "15",
      mobileVendor: "",
      mobileModel: "",
    });

    await vi.waitFor(() => {
      expect(connection.sent).toEqual([
        {
          type: MessageType.Info,
          files: [
            {
              fileName: "sample.bin",
              size: 32,
              type: "application/octet-stream",
            },
          ],
        },
      ]);
    });
  });

  it("requires the password before revealing file metadata", async () => {
    const session = new UploaderSession({ files: [createFile(32)], password: "secret" });
    const connection = new FakeConnection();
    session.attach(connection);

    connection.emit("data", {
      type: MessageType.RequestInfo,
      browserName: "Chrome",
      browserVersion: "126",
      osName: "macOS",
      osVersion: "15",
      mobileVendor: "",
      mobileModel: "",
    });
    connection.emit("data", {
      type: MessageType.UsePassword,
      password: "wrong",
    });
    connection.emit("data", {
      type: MessageType.UsePassword,
      password: "secret",
    });

    await vi.waitFor(() => {
      expect(connection.sent).toEqual([
        { type: MessageType.PasswordRequired },
        { type: MessageType.PasswordRequired, errorMessage: "Invalid password" },
        {
          type: MessageType.Info,
          files: [
            {
              fileName: "sample.bin",
              size: 32,
              type: "application/octet-stream",
            },
          ],
        },
      ]);
    });
  });

  it("streams file chunks in FilePizza-compatible sizes", async () => {
    vi.useFakeTimers();
    const session = new UploaderSession({
      files: [createFile(MAX_CHUNK_SIZE + 1024)],
      sendDelayMs: 1,
    });
    const connection = new FakeConnection();
    session.attach(connection);

    connection.emit("data", {
      type: MessageType.Start,
      fileName: "sample.bin",
      offset: 0,
    });

    await vi.waitFor(() => {
      expect(connection.sent).toHaveLength(1);
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(connection.sent).toHaveLength(2);
    });

    const firstChunk = connection.sent[0] as {
      type: MessageType;
      fileName: string;
      offset: number;
      bytes: Uint8Array;
      final: boolean;
    };
    const secondChunk = connection.sent[1] as {
      type: MessageType;
      fileName: string;
      offset: number;
      bytes: Uint8Array;
      final: boolean;
    };

    expect(firstChunk).toMatchObject({
      type: MessageType.Chunk,
      fileName: "sample.bin",
      offset: 0,
      final: false,
    });
    expect(firstChunk.bytes).toHaveLength(MAX_CHUNK_SIZE);

    expect(secondChunk).toMatchObject({
      type: MessageType.Chunk,
      fileName: "sample.bin",
      offset: MAX_CHUNK_SIZE,
      final: true,
    });
    expect(secondChunk.bytes).toHaveLength(1024);
  });
});
