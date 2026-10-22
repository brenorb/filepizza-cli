import { abortable, delay } from "./async-control.js";
import { materializeManifestStatus, type UploadManifest, type UploadStore } from "./upload-store.js";

type Store = Pick<UploadStore, "read" | "requestStop">;
type WorkerProcess = {
  once(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  unref(): void;
};

export async function startShare(store: Store, uploadId: string, spawnWorker: () => WorkerProcess, timeoutMs: number, signal?: AbortSignal): Promise<UploadManifest> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error(`Share interrupted; stop requested for ${uploadId}. Inspect filepizza status ${uploadId}.`));
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  let child: WorkerProcess | undefined;
  const failed = (error: Error) => controller.abort(new Error(`Could not start upload ${uploadId}: ${error.message}`));
  const exited = (code: number | null, exitSignal: string | null) => controller.abort(new Error(`Background worker for ${uploadId} exited (${exitSignal ?? code}); inspect filepizza status ${uploadId}.`));
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    child = spawnWorker();
    child.once("error", failed);
    child.once("exit", exited);
    child.unref();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const manifest = materializeManifestStatus(await abortable(store.read(uploadId), controller.signal));
        if (!manifest.ok || manifest.status === "error") throw new Error(manifest.error ?? `Upload ${uploadId} failed`);
        if (manifest.status === "stopped") throw new Error(`Upload ${uploadId} stopped before becoming ready; inspect filepizza status ${uploadId}.`);
        if (manifest.status === "seeding" && manifest.alive && manifest.shortUrl && manifest.longUrl) return manifest;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Unknown upload_id:")) throw error;
      }
      await delay(Math.min(100, Math.max(1, deadline - Date.now())), controller.signal);
    }
    throw new Error(`Timed out waiting for upload ${uploadId}; the background share may continue. Inspect filepizza status ${uploadId} or stop it with filepizza stop ${uploadId}.`);
  } catch (error) {
    if (signal?.aborted && child) {
      await store.requestStop(uploadId);
      const interrupted = new Error(`Share interrupted; stop requested for ${uploadId}. Inspect filepizza status ${uploadId}.`);
      interrupted.name = "AbortError";
      throw interrupted;
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    child?.off("error", failed);
    child?.off("exit", exited);
  }
}

export async function stopShare(store: Store, uploadId: string, timeoutMs: number, signal?: AbortSignal): Promise<UploadManifest> {
  const initial = materializeManifestStatus(await store.read(uploadId));
  if (initial.status === "stopped" || initial.status === "error") return initial;
  if (initial.controlVersion !== 1) throw new Error(`Upload ${uploadId} uses an older worker without safe stop support; inspect its process before stopping it manually. New shares support filepizza stop.`);
  await store.requestStop(uploadId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const manifest = materializeManifestStatus(await abortable(store.read(uploadId), signal));
    if (manifest.status === "stopped" || manifest.status === "error") return manifest;
    await delay(Math.min(100, Math.max(1, deadline - Date.now())), signal);
  }
  throw new Error(`Timed out waiting for upload ${uploadId} to stop; the stop request remains pending. Inspect filepizza status ${uploadId}.`);
}
