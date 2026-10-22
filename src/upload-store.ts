import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type UploadStatus = "starting" | "seeding" | "stopped" | "error";

export type UploadManifest = {
  ok: boolean;
  uploadId: string;
  filePath: string;
  fileName: string;
  pid?: number;
  peerId?: string;
  shortSlug?: string;
  longSlug?: string;
  shortUrl?: string;
  longUrl?: string;
  secret?: string;
  status: UploadStatus;
  startedAt: string;
  updatedAt: string;
  error?: string;
  alive?: boolean;
};

export class UploadStore {
  readonly rootDir: string;
  readonly uploadsDir: string;

  constructor(rootDir = defaultCacheDir()) {
    this.rootDir = rootDir;
    this.uploadsDir = join(rootDir, "uploads");
  }

  async write(manifest: UploadManifest): Promise<void> {
    const destination = this.manifestPath(manifest.uploadId);
    await mkdir(this.uploadsDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.uploadsDir, 0o700);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async read(uploadId: string): Promise<UploadManifest> {
    try {
      const raw = await readFile(this.manifestPath(uploadId), "utf8");
      const value = JSON.parse(raw) as unknown;
      if (!isUploadManifest(value) || value.uploadId !== uploadId) {
        throw new Error(`Invalid upload manifest for ${uploadId}; restore its cache file from a backup or remove the corrupt record.`);
      }
      return value;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid upload manifest for ${uploadId}; restore its cache file from a backup or remove the corrupt record.`);
      }
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Unknown upload_id: ${uploadId}`);
      }
      throw error;
    }
  }

  manifestPath(uploadId: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(uploadId)) {
      throw new Error("Invalid upload ID; use the identifier printed by filepizza share.");
    }
    return join(this.uploadsDir, `${uploadId}.json`);
  }
}

function defaultCacheDir(): string {
  const legacyHome = process.env.FILEPIZZA_CLI_HOME;
  if (legacyHome) return join(legacyHome, ".cache", "filepizza-cli");
  const xdg = process.env.XDG_CACHE_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".cache"), "filepizza-cli");
}

function isUploadManifest(value: unknown): value is UploadManifest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.ok === "boolean"
    && ["uploadId", "filePath", "fileName", "startedAt", "updatedAt"].every(key => typeof record[key] === "string")
    && typeof record.status === "string"
    && ["starting", "seeding", "stopped", "error"].includes(record.status)
    && ["peerId", "shortSlug", "longSlug", "shortUrl", "longUrl", "secret", "error"].every(key => record[key] === undefined || typeof record[key] === "string")
    && (record.pid === undefined || (typeof record.pid === "number" && Number.isSafeInteger(record.pid) && record.pid > 0 && record.pid <= 2 ** 31 - 1));
}

export function createUploadId(now = new Date()): string {
  const iso = now.toISOString().replace(/[-:]/g, "");
  const stamp = iso.slice(0, 15).replace("T", "-");
  const suffix = Math.random().toString(16).slice(2, 10);
  return `${stamp}-${suffix}`;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function isPidAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function materializeManifestStatus(manifest: UploadManifest): UploadManifest {
  const alive = isPidAlive(manifest.pid);
  if (manifest.status === "seeding" && !alive) {
    return {
      ...manifest,
      alive,
      status: "stopped",
    };
  }

  return {
    ...manifest,
    alive,
  };
}
