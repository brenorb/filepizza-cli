#!/usr/bin/env node

import { Command } from "commander";
import { SeederService } from "./seeder-service.js";

const program = new Command();

program
  .requiredOption("--upload-id <uploadId>", "Upload identifier")
  .requiredOption("--file <path>", "Path to the file to seed")
  .option("--password <password>", "Optional download password");

program.parse(process.argv);

const options = program.opts<{
  uploadId: string;
  file: string;
  password?: string;
}>();

const service = new SeederService();
const started = await service.startUpload({
  uploadId: options.uploadId,
  filePath: options.file,
  password: options.password,
});

let stopping = false;
const stop = async () => {
  if (stopping) {
    return;
  }
  stopping = true;
  await started.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});

await new Promise<void>(() => {});
