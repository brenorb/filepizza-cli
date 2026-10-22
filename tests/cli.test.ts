import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "filepizza-cli-contract-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });
function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, FILEPIZZA_CLI_HOME: home },
  });
}
async function manifest(status = "stopped") {
  const dir = join(home, ".cache", "filepizza-cli", "uploads");
  await mkdir(dir, { recursive: true });
  const entry = { ok: status !== "error", uploadId: "sample", fileName: "sample.txt", filePath: "/tmp/sample.txt", status,
    shortUrl: "https://file.pizza/sample", longUrl: "https://file.pizza/a-long-link", startedAt: "2026-10-22", updatedAt: "2026-10-22", error: status === "error" ? "channel unavailable" : undefined };
  await writeFile(join(dir, "sample.json"), JSON.stringify(entry));
  return entry;
}

describe("CLI contracts", () => {
  it("shows successful concise help without arguments", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("filepizza share");
    expect(result.stdout).toContain("--help");
    expect(result.stderr).toBe("");
  });
  it("makes help available before validating other arguments", () => {
    const result = run("share", "--timeout", "invalid", "--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Examples:");
    expect(result.stdout).toContain("github.com/brenorb/filepizza-cli");
  });
  it("has an installed-package version", () => {
    const result = run("--version");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("offers human output by default", async () => {
    await manifest();
    const result = run("status", "sample");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Status: stopped");
    expect(result.stdout).toContain("https://file.pizza/sample");
    expect(result.stdout.trim().startsWith("{")).toBe(false);
    expect(result.stderr).toBe("");
  });
  it("keeps explicit JSON output parseable and free of commentary", async () => {
    await manifest();
    const result = run("status", "sample", "--json");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uploadId: "sample", status: "stopped" });
    expect(result.stderr).toBe("");
  });
  it.each(["0", "-1", "nan", "1second", "Infinity"])("rejects invalid timeout %s before spawning a worker", async (timeout) => {
    const file = join(home, "share.txt");
    await writeFile(file, "hello");
    const result = run("share", file, "--timeout", timeout);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("positive");
  });
  it("reports failed uploads with failure exit status", async () => {
    await manifest("error");
    const result = run("stop", "sample");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("channel unavailable");
  });
  it("rejects unexpected extra arguments", async () => {
    await manifest();
    const result = run("status", "sample", "unexpected");
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });
});
