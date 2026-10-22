#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { UploadStore, createUploadId, materializeManifestStatus, type UploadManifest } from "./upload-store.js";

const program = new Command();
const store = new UploadStore();

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
program.name("filepizza").description("Create and seed FilePizza shares from your terminal")
  .version(version)
  .option("--json", "Print the upload manifest as JSON")
  .option("-q, --quiet", "Suppress progress messages")
  .showHelpAfterError("Run filepizza --help for examples.")
  .exitOverride()
  .addHelpText("after", "\nExamples:\n  filepizza share ./report.pdf\n  filepizza status <upload-id> --json\n  filepizza stop <upload-id>\n\nDocs: https://github.com/brenorb/filepizza-cli#readme\nIssues: https://github.com/brenorb/filepizza-cli/issues");

function timeoutSeconds(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || !Number.isSafeInteger(Math.ceil(seconds * 1000)) || seconds <= 0 || value.trim() === "") {
    throw new InvalidArgumentError("timeout must be a finite positive number of seconds");
  }
  return seconds;
}

function printResult(manifest: UploadManifest): void {
  if (manifest.status === "error" || !manifest.ok) {
    throw new Error(manifest.error ?? `Upload ${manifest.uploadId} failed`);
  }
  if (program.opts().json) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    process.stdout.write(`Upload: ${manifest.uploadId}\nStatus: ${manifest.status}\nFile: ${manifest.fileName}\n`);
    if (manifest.shortUrl) process.stdout.write(`URL: ${manifest.shortUrl}\n`);
    if (manifest.status === "seeding") {
      process.stdout.write(`Stop sharing: filepizza stop ${manifest.uploadId}\n`);
    }
  }
}

program
  .command("share")
  .argument("<file>", "Path to the file to share")
  .description("Start a background seeder and print its share URL")
  .option("--timeout <seconds>", "Seconds to wait for the share URL", timeoutSeconds, 30)
  .action(async (file: string, options: { timeout: number }) => {
    await access(file);
    if (!(await stat(file)).isFile()) throw new Error(`Expected a regular file: ${file}`);

    const uploadId = createUploadId();
    const timeoutMs = options.timeout * 1000;
    const worker = resolveWorkerCommand();

    const child = spawn(worker.command, [...worker.args, "--upload-id", uploadId, "--file", file], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();

    if (!program.opts().quiet) process.stderr.write(`Starting background share ${uploadId}...\n`);

    const manifest = await waitForUploadReady(store, uploadId, timeoutMs);
    printResult(manifest);
  });

program
  .command("status")
  .description("Inspect a recorded upload")
  .argument("<uploadId>", "Upload identifier")
  .action(async (uploadId: string) => {
    const manifest = materializeManifestStatus(await store.read(uploadId));
    printResult(manifest);
  });

program
  .command("stop")
  .description("Stop a background seeder")
  .argument("<uploadId>", "Upload identifier")
  .option("--timeout <seconds>", "Seconds to wait for shutdown", timeoutSeconds, 15)
  .action(async (uploadId: string, options: { timeout: number }) => {
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
      options.timeout * 1000,
    );
    printResult(stopped);
  });

for (const command of program.commands) {
  command.addHelpText("after", `\nExamples:\n  filepizza ${command.name()} ${command.name() === "share" ? "./report.pdf" : "<upload-id>"}\n\nDocs: https://github.com/brenorb/filepizza-cli#usage\nIssues: https://github.com/brenorb/filepizza-cli/issues`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const beforeDash = args.includes("--") ? args.slice(0, args.indexOf("--")) : args;
  if (beforeDash.includes("--help") || beforeDash.includes("-h")) {
    (program.commands.find(command => beforeDash.includes(command.name())) ?? program).outputHelp();
    return;
  }
  if (args.length === 0) {
    process.stdout.write("Create and seed FilePizza shares.\n\nExamples:\n  filepizza share ./report.pdf\n  filepizza status <upload-id> --json\n\nRun filepizza --help for all commands.\n");
    return;
  }
  if (args.length === 1 && program.commands.some(command => command.name() === args[0])) {
    program.commands.find(command => command.name() === args[0])!.outputHelp();
    return;
  }
  await program.parseAsync(process.argv);
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  process.stderr.write(`filepizza: could not write output: ${error.message}\n`);
  process.exitCode = 1;
});

main().catch((error: unknown) => {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`filepizza: ${message}\n`);
  process.exitCode = 1;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
