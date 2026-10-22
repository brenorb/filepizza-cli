#!/usr/bin/env node

import { startShare, stopShare } from "./lifecycle.js";
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

function requestTimeoutSeconds(value: string): number {
  const seconds = timeoutSeconds(value);
  if (seconds * 1000 > 2147483647) throw new InvalidArgumentError("request timeout must be at most 2147483.647 seconds");
  return seconds;
}

function printResult(manifest: UploadManifest): void {
  if (manifest.status === "error" || !manifest.ok) {
    throw new Error(manifest.error ?? `Upload ${manifest.uploadId} failed`);
  }
  if (manifest.warning) process.stderr.write(`warning: ${manifest.warning}\n`);
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
  .option("--request-timeout <seconds>", "Deadline for each HTTP request including response body", requestTimeoutSeconds, 10)
  .action(async (file: string, options: { timeout: number; requestTimeout: number }) => {
    await access(file);
    if (!(await stat(file)).isFile()) throw new Error(`Expected a regular file: ${file}`);

    const uploadId = createUploadId();
    const timeoutMs = options.timeout * 1000;
    const worker = resolveWorkerCommand();

    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    try {
      if (!program.opts().quiet) process.stderr.write(`Starting background share ${uploadId}...\n`);
      const manifest = await startShare(store, uploadId, () => spawn(worker.command, [...worker.args, "--upload-id", uploadId, "--file", file, "--request-timeout", String(Math.ceil(options.requestTimeout * 1000))], {
        detached: true, stdio: "ignore", env: process.env,
      }), timeoutMs, controller.signal);
      printResult(manifest);
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
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
    const stopped = await stopShare(store, uploadId, options.timeout * 1000);
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
  process.exitCode = error instanceof Error && error.name === "AbortError" ? 130 : 1;
});

main().catch((error: unknown) => {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`filepizza: ${message}\n`);
  process.exitCode = error instanceof Error && error.name === "AbortError" ? 130 : 1;
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

