import { open, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { UploadFile } from "./uploader-session.js";

export type DisposableUploadFile = UploadFile & {
  dispose(): Promise<void>;
  filePath: string;
};

export async function createNodeUploadFile(filePath: string): Promise<DisposableUploadFile> {
  const resolvedPath = resolve(filePath);
  const fileStat = await stat(resolvedPath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${resolvedPath}`);
  }

  const handle = await open(resolvedPath, "r");

  return {
    filePath: resolvedPath,
    fileName: basename(resolvedPath),
    size: fileStat.size,
    type: "application/octet-stream",
    async readRange(offset: number, end: number): Promise<Uint8Array> {
      const length = Math.max(0, end - offset);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    },
    async dispose(): Promise<void> {
      await handle.close();
    },
  };
}
