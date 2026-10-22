import { delay } from "./async-control.js";
import type { SeederService, StartedUpload } from "./seeder-service.js";
import type { UploadStore } from "./upload-store.js";

type WorkerOptions = {
  store: UploadStore;
  service: Pick<SeederService, "startUpload">;
  uploadId: string;
  filePath: string;
  password?: string;
  signal?: AbortSignal;
  pollMs?: number;
};

/** A stop request is addressed to an upload, never to a reusable process ID. */
export async function runBackgroundWorker(options: WorkerOptions): Promise<number> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  let started: StartedUpload | undefined;
  let startupError: unknown;
  let startupFailed = false;
  const startup = options.service.startUpload({ uploadId: options.uploadId, filePath: options.filePath, password: options.password, signal: controller.signal })
    .then(value => { started = value; }, error => { startupError = error; startupFailed = true; });
  try {
    while (true) {
      if (controller.signal.aborted || await options.store.isStopRequested(options.uploadId)) {
        controller.abort();
        await startup;
        if (started) await started.stop();
        await options.store.clearStopRequest(options.uploadId);
        return 0;
      }
      if (startupFailed) throw startupError;
      if (started) {
        const manifest = await options.store.read(options.uploadId);
        if (manifest.status === "error" || manifest.status === "stopped") {
          await started.stop();
          return manifest.status === "error" ? 1 : 0;
        }
      }
      try { await delay(options.pollMs ?? 100, controller.signal); }
      catch { /* Re-check the abort state and stop cooperatively. */ }
    }
  } catch (error) {
    controller.abort();
    await startup;
    await started?.stop();
    throw error;
  } finally { options.signal?.removeEventListener("abort", cancel); }
}
