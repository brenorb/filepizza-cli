#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { UploadStore, createUploadId, materializeManifestStatus, type UploadManifest } from "./upload-store.js";

const program = new Command();
const store = new UploadStore();

program.name("filepizza").description("Programmatic FilePizza uploader CLI");

program
  .command("share")
  .argument("<file>", "Path to the file to share")
  .option("--timeout <seconds>", "Seconds to wait for the share URL", "30")
  .action(async (file: string, options: { timeout: string }) => {
    await access(file);

    const uploadId = createUploadId();
    const timeoutMs = Number.parseInt(options.timeout, 10) * 1000;
    const worker = resolveWorkerCommand();

    const child = spawn(worker.command, [...worker.args, "--upload-id", uploadId, "--file", file], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();

    const manifest = await waitForUploadReady(store, uploadId, timeoutMs);
    printJson(manifest);
  });

program
  .command("status")
  .argument("<uploadId>", "Upload identifier")
  .action(async (uploadId: string) => {
    const manifest = materializeManifestStatus(await store.read(uploadId));
    printJson(manifest);
  });

program
  .command("stop")
  .argument("<uploadId>", "Upload identifier")
  .option("--timeout <seconds>", "Seconds to wait for shutdown", "15")
  .action(async (uploadId: string, options: { timeout: string }) => {
    const manifest = await store.read(uploadId);
    const pid = manifest.pid;
    if (typeof pid === "number") {
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("ESRCH")) {
          throw error;
        }
      }
    }

    const stopped = await waitForUploadStopped(
      store,
      uploadId,
      Number.parseInt(options.timeout, 10) * 1000,
    );
    printJson(stopped);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

function resolveWorkerCommand(): { command: string; args: string[] } {
  const currentPath = fileURLToPath(import.meta.url);
  if (currentPath.includes("/src/")) {
    return {
      command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./worker.ts", import.meta.url))],
    };
  }

  return {
    command: process.execPath,
    args: [fileURLToPath(new URL("./worker.js", import.meta.url))],
  };
}

async function waitForUploadReady(
  uploadStore: UploadStore,
  uploadId: string,
  timeoutMs: number,
): Promise<UploadManifest> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const manifest = materializeManifestStatus(await uploadStore.read(uploadId));
      if (manifest.status === "error") {
        throw new Error(manifest.error ?? `Upload ${uploadId} failed`);
      }
      if (manifest.shortUrl && manifest.longUrl) {
        return manifest;
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Unknown upload_id")) {
        throw error;
      }
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for upload ${uploadId} to become ready`);
}

async function waitForUploadStopped(
  uploadStore: UploadStore,
  uploadId: string,
  timeoutMs: number,
): Promise<UploadManifest> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const manifest = materializeManifestStatus(await uploadStore.read(uploadId));
    if (manifest.status === "stopped" || manifest.status === "error") {
      return manifest;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for upload ${uploadId} to stop`);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
