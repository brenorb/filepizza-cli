import { expect, it } from "vitest";
import { resolveWorkerCommand } from "../src/worker-command.js";

it("uses packaged JavaScript even when an ancestor directory is named src", () => {
  expect(resolveWorkerCommand("file:///work/src/node_modules/filepizza-cli/dist/cli.js", "/node")).toEqual({ command: "/node", args: ["/work/src/node_modules/filepizza-cli/dist/worker.js"] });
});

it("supports checkout TypeScript with escaped filesystem paths", () => {
  expect(resolveWorkerCommand("file:///work/my%20code/filepizza-cli/src/cli.ts", "/node")).toEqual({ command: "/node", args: ["--import", "tsx", "/work/my code/filepizza-cli/src/worker.ts"] });
});
