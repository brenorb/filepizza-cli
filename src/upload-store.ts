import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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

  constructor(rootDir = join(process.env.FILEPIZZA_CLI_HOME ?? homedir(), ".cache", "filepizza-cli")) {
    this.rootDir = rootDir;
    this.uploadsDir = join(rootDir, "uploads");
  }

  async write(manifest: UploadManifest): Promise<void> {
    await mkdir(this.uploadsDir, { recursive: true });
    await writeFile(this.manifestPath(manifest.uploadId), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  async read(uploadId: string): Promise<UploadManifest> {
    try {
      const raw = await readFile(this.manifestPath(uploadId), "utf8");
      return JSON.parse(raw) as UploadManifest;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Unknown upload_id: ${uploadId}`);
      }
      throw error;
    }
  }

  manifestPath(uploadId: string): string {
    return join(this.uploadsDir, `${uploadId}.json`);
  }
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
