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
  private sendChunkTimeout: NodeJS.Timeout | null = null;

  constructor(options: UploaderSessionOptions) {
    this.files = options.files;
    this.password = options.password ?? "";
    this.sendDelayMs = options.sendDelayMs ?? 0;
    this.fileMap = new Map(options.files.map((file) => [file.fileName, file]));
  }

  attach(connection: DataConnectionLike): void {
    connection.on("data", (data: unknown) => {
      void this.handleIncoming(connection, decodeMessage(data));
    });
    connection.on("close", () => {
      this.clearPendingChunk();
    });
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
        this.clearPendingChunk();
        return;
      case MessageType.Done:
        this.clearPendingChunk();
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
    if (!file || offset > file.size) {
      connection.send({
        type: MessageType.Error,
        error: "invalid file offset",
      });
      return;
    }

    this.clearPendingChunk();

    const sendNextChunk = async (currentOffset: number): Promise<void> => {
      const end = Math.min(file.size, currentOffset + MAX_CHUNK_SIZE);
      const bytes = await file.readRange(currentOffset, end);
      const final = end >= file.size;

      connection.send({
        type: MessageType.Chunk,
        fileName,
        offset: currentOffset,
        bytes,
        final,
      });

      if (final) {
        this.sendChunkTimeout = null;
        return;
      }

      this.sendChunkTimeout = setTimeout(() => {
        void sendNextChunk(end);
      }, this.sendDelayMs);
    };

    await sendNextChunk(offset);
  }

  private clearPendingChunk(): void {
    if (!this.sendChunkTimeout) {
      return;
    }
    clearTimeout(this.sendChunkTimeout);
    this.sendChunkTimeout = null;
  }
}
