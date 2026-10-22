import { EventEmitter } from "node:events";
import { decodeMessage, MessageType, type Message } from "./messages.js";

export const MAX_CHUNK_SIZE = 256 * 1024;

export type UploadFile = {
  fileName: string;
  size: number;
  type: string;
  readRange(offset: number, end: number): Promise<Uint8Array>;
};

export type DataConnectionLike = EventEmitter & {
  send(payload: unknown): void;
  close(): void;
};

export type UploaderSessionOptions = {
  files: UploadFile[];
  password?: string;
  sendDelayMs?: number;
};

export class UploaderSession {
  readonly files: UploadFile[];
  readonly password: string;
  readonly sendDelayMs: number;
  private readonly fileMap: Map<string, UploadFile>;
  private readonly connections = new WeakMap<DataConnectionLike, { timer: NodeJS.Timeout | null; generation: number; closed: boolean }>();

  constructor(options: UploaderSessionOptions) {
    this.files = options.files;
    this.password = options.password ?? "";
    this.sendDelayMs = options.sendDelayMs ?? 0;
    this.fileMap = new Map(options.files.map((file) => [file.fileName, file]));
  }

  attach(connection: DataConnectionLike): void {
    this.connections.set(connection, { timer: null, generation: 0, closed: false });
    connection.on("data", (data: unknown) => {
      if (this.connections.get(connection)?.closed) return;
      let message: Message;
      try { message = decodeMessage(data); }
      catch { this.failConnection(connection, "Invalid peer message"); return; }
      void this.handleIncoming(connection, message).catch(() => this.failConnection(connection, "File transfer failed"));
    });
    connection.on("close", () => {
      this.clearPendingChunk(connection);
      const state = this.connections.get(connection);
      if (state) state.closed = true;
    });
    connection.on("error", () => this.failConnection(connection, "File transfer failed"));
  }

  private async handleIncoming(connection: DataConnectionLike, message: Message): Promise<void> {
    switch (message.type) {
      case MessageType.RequestInfo:
        if (this.password) {
          connection.send({ type: MessageType.PasswordRequired });
          return;
        }
        this.sendInfo(connection);
        return;
      case MessageType.UsePassword:
        if (message.password !== this.password) {
          connection.send({
            type: MessageType.PasswordRequired,
            errorMessage: "Invalid password",
          });
          return;
        }
        this.sendInfo(connection);
        return;
      case MessageType.Start:
        await this.startTransfer(connection, message.fileName, message.offset);
        return;
      case MessageType.Pause:
        this.clearPendingChunk(connection);
        return;
      case MessageType.Done:
        this.clearPendingChunk(connection);
        this.connections.get(connection)!.closed = true;
        connection.close();
        return;
      case MessageType.ChunkAck:
      case MessageType.Info:
      case MessageType.Chunk:
      case MessageType.Error:
      case MessageType.PasswordRequired:
      case MessageType.Report:
        return;
      default:
        return;
    }
  }

  private sendInfo(connection: DataConnectionLike): void {
    connection.send({
      type: MessageType.Info,
      files: this.files.map((file) => ({
        fileName: file.fileName,
        size: file.size,
        type: file.type,
      })),
    });
  }

  private async startTransfer(
    connection: DataConnectionLike,
    fileName: string,
    offset: number,
  ): Promise<void> {
    const file = this.fileMap.get(fileName);
    if (!file || !Number.isSafeInteger(offset) || offset < 0 || offset > file.size) {
      connection.send({
        type: MessageType.Error,
        error: "invalid file offset",
      });
      return;
    }

    this.clearPendingChunk(connection);
    const state = this.connections.get(connection)!;
    const generation = state.generation;

    const sendNextChunk = async (currentOffset: number): Promise<void> => {
      if (state.closed || state.generation !== generation) return;
      const end = Math.min(file.size, currentOffset + MAX_CHUNK_SIZE);
      const bytes = await file.readRange(currentOffset, end);
      // A pause/close/new transfer may arrive while the file read is pending.
      if (state.closed || state.generation !== generation) return;
      const final = end >= file.size;

      connection.send({
        type: MessageType.Chunk,
        fileName,
        offset: currentOffset,
        bytes,
        final,
      });

      if (final) {
        state.timer = null;
        return;
      }

      state.timer = setTimeout(() => {
        state.timer = null;
        void sendNextChunk(end).catch(() => this.failConnection(connection, "File transfer failed"));
      }, this.sendDelayMs);
    };

    await sendNextChunk(offset);
  }

  private clearPendingChunk(connection: DataConnectionLike): void {
    const state = this.connections.get(connection);
    if (!state) return;
    state.generation += 1;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  private failConnection(connection: DataConnectionLike, message: string): void {
    const state = this.connections.get(connection);
    if (!state || state.closed) return;
    this.clearPendingChunk(connection);
    state.closed = true;
    // Do not let malformed frames, native transport errors, or local file
    // failures escape an event callback and terminate unrelated shares.
    try { connection.send({ type: MessageType.Error, error: message }); } catch { /* transport already closed */ }
    try { connection.close(); } catch { /* best effort after a transport failure */ }
  }
}
