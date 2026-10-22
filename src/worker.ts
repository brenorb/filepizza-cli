#!/usr/bin/env node
import { Command } from "commander";
import { FilePizzaApi } from "./filepizza-api.js";
import { SeederService } from "./seeder-service.js";
import { UploadStore } from "./upload-store.js";
import { runBackgroundWorker } from "./worker-runtime.js";

const program = new Command();
program.requiredOption("--upload-id <uploadId>", "Upload identifier")
  .requiredOption("--file <path>", "Path to the file to seed")
  .option("--request-timeout <ms>", "HTTP request deadline in milliseconds", Number, 10000)
  .option("--password <password>", "Optional download password");
program.parse(process.argv);
const options = program.opts<{ uploadId: string; file: string; password?: string; requestTimeout: number }>();
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
try {
  const store = new UploadStore();
  const service = new SeederService({ store, api: new FilePizzaApi({ timeoutMs: options.requestTimeout }) });
  process.exitCode = await runBackgroundWorker({ store, service, uploadId: options.uploadId, filePath: options.file, password: options.password, signal: controller.signal });
} catch (error) {
  process.stderr.write(`filepizza worker: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
// Native WebRTC handles can outlive their peer object after cleanup.
process.exit(process.exitCode ?? 0);
