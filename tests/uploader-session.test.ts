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


describe("peer failure containment", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects malformed frames without throwing or exposing their contents", () => {
    const connection = new FakeConnection();
    new UploaderSession({ files: [createFile(32)] }).attach(connection);
    expect(() => connection.emit("data", { type: "PRIVATE_MALFORMED_FRAME" })).not.toThrow();
    expect(connection.closed).toBe(true);
    expect(JSON.stringify(connection.sent)).not.toContain("PRIVATE_MALFORMED_FRAME");
  });

  it("contains file-read rejections without an unhandled async error", async () => {
    const connection = new FakeConnection();
    const file = createFile(32);
    file.readRange = async () => { throw new Error("PRIVATE_LOCAL_PATH"); };
    new UploaderSession({ files: [file] }).attach(connection);
    connection.emit("data", { type: MessageType.Start, fileName: file.fileName, offset: 0 });
    await vi.waitFor(() => expect(connection.closed).toBe(true));
    expect(connection.sent).toContainEqual({ type: MessageType.Error, error: "File transfer failed" });
    expect(JSON.stringify(connection.sent)).not.toContain("PRIVATE_LOCAL_PATH");
  });

  it("contains send failures and peer error events", async () => {
    const connection = new FakeConnection();
    vi.spyOn(connection, "send").mockImplementation(() => { throw new Error("connection lost"); });
    new UploaderSession({ files: [createFile(32)] }).attach(connection);
    expect(() => connection.emit("error", new Error("peer failed"))).not.toThrow();
    expect(connection.closed).toBe(true);
  });

  it("contains failures from timer-driven later chunks", async () => {
    vi.useFakeTimers();
    const connection = new FakeConnection();
    const file = createFile(MAX_CHUNK_SIZE + 32);
    const read = file.readRange;
    file.readRange = async (offset, end) => {
      if (offset > 0) throw new Error("disk failed");
      return read(offset, end);
    };
    new UploaderSession({ files: [file], sendDelayMs: 1 }).attach(connection);
    connection.emit("data", { type: MessageType.Start, fileName: file.fileName, offset: 0 });
    await vi.advanceTimersByTimeAsync(2);
    expect(connection.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not send a late chunk after pause", async () => {
    const connection = new FakeConnection();
    const file = createFile(32);
    let finish!: (bytes: Uint8Array) => void;
    file.readRange = () => new Promise(resolve => { finish = resolve; });
    new UploaderSession({ files: [file] }).attach(connection);
    connection.emit("data", { type: MessageType.Start, fileName: file.fileName, offset: 0 });
    connection.emit("data", { type: MessageType.Pause });
    finish(new Uint8Array(32));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(connection.sent).toEqual([]);
  });

  it("isolates chunk scheduling between two peers", async () => {
    vi.useFakeTimers();
    const first = new FakeConnection();
    const second = new FakeConnection();
    const file = createFile(MAX_CHUNK_SIZE + 32);
    const session = new UploaderSession({ files: [file], sendDelayMs: 1 });
    session.attach(first);
    session.attach(second);
    first.emit("data", { type: MessageType.Start, fileName: file.fileName, offset: 0 });
    await vi.advanceTimersByTimeAsync(0);
    second.emit("close");
    await vi.advanceTimersByTimeAsync(2);
    expect(first.sent).toHaveLength(2);
  });
});
