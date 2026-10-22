import { fileURLToPath } from "node:url";
export function resolveWorkerCommand(moduleUrl: string, executable = process.execPath): { command: string; args: string[] } {
  const currentPath = fileURLToPath(moduleUrl);
  if (currentPath.endsWith(".ts")) {
    return { command: executable, args: ["--import", "tsx", fileURLToPath(new URL("./worker.ts", moduleUrl))] };
  }
  return { command: executable, args: [fileURLToPath(new URL("./worker.js", moduleUrl))] };
}
