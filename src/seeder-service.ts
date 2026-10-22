import { basename, resolve } from "node:path";
import { abortable, bounded } from "./async-control.js";
import { FilePizzaApi, type Channel, type IceConfig } from "./filepizza-api.js";
import { createPeerFromIce, waitForPeerOpen, type PeerLike } from "./node-peer.js";
import { createNodeUploadFile, type DisposableUploadFile } from "./node-upload-file.js";
import { UploaderSession } from "./uploader-session.js";
import { UploadStore, utcNow, type UploadManifest } from "./upload-store.js";

export type SeederServiceDependencies = {
  api?: Pick<FilePizzaApi, "getIceConfig" | "createChannel" | "renewChannel" | "destroyChannel" | "channelUrl">;
  createPeer?: (ice: IceConfig) => Promise<PeerLike>;
  createUploadFile?: (filePath: string) => Promise<DisposableUploadFile>;
  store?: UploadStore;
  renewIntervalMs?: number;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
};
export type StartedUpload = { manifest: UploadManifest; stop(): Promise<UploadManifest> };

export class SeederService {
  readonly api;
  readonly createPeer;
  readonly createUploadFile;
  readonly store;
  readonly renewIntervalMs;
  readonly startupTimeoutMs;
  readonly shutdownTimeoutMs;
  constructor(deps: SeederServiceDependencies = {}) {
    this.api = deps.api ?? new FilePizzaApi();
    this.createPeer = deps.createPeer ?? createPeerFromIce;
    this.createUploadFile = deps.createUploadFile ?? createNodeUploadFile;
    this.store = deps.store ?? new UploadStore();
    this.renewIntervalMs = deps.renewIntervalMs ?? 60000;
    this.startupTimeoutMs = deps.startupTimeoutMs ?? 30000;
    this.shutdownTimeoutMs = deps.shutdownTimeoutMs ?? 5000;
  }

  async startUpload(options: { uploadId: string; filePath: string; password?: string; signal?: AbortSignal }): Promise<StartedUpload> {
    const resolvedPath = resolve(options.filePath);
    let manifest: UploadManifest = {
      ok: true, uploadId: options.uploadId, filePath: resolvedPath,
      fileName: basename(resolvedPath), pid: process.pid, controlVersion: 1,
      status: "starting", startedAt: utcNow(), updatedAt: utcNow(),
    };
    await this.store.write(manifest);
    const lifetime = new AbortController();
    const startup = new AbortController();
    const startupTimer = setTimeout(() => startup.abort(new Error("Upload startup timed out")), this.startupTimeoutMs);
    const startupSignal = AbortSignal.any([lifetime.signal, startup.signal, ...(options.signal ? [options.signal] : [])]);
    let peer: PeerLike | undefined;
    let uploadFile: DisposableUploadFile | undefined;
    let channel: Channel | undefined;
    let renewTimer: NodeJS.Timeout | undefined;
    let stopPromise: Promise<UploadManifest> | undefined;
    const cleanup = (status: "stopped" | "error", error?: string): Promise<UploadManifest> => {
      if (stopPromise) return stopPromise;
      stopPromise = Promise.resolve().then(async () => {
        lifetime.abort();
        clearTimeout(startupTimer);
        if (renewTimer) clearInterval(renewTimer);
        // Local serving ends immediately even if the remote control plane hangs.
        let warning: string | undefined;
        try { peer?.destroy(); } catch (cause) { warning = `Local peer cleanup failed: ${String(cause)}`; }
        try {
          const jobs = [uploadFile?.dispose(), channel ? this.api.destroyChannel(channel.shortSlug) : undefined];
          const results = await bounded(Promise.allSettled(jobs), this.shutdownTimeoutMs, "Remote/file cleanup timed out; local seeding stopped; remote links may remain until expiry");
          if (results.some(result => result.status === "rejected" || result.value === false)) warning = "Local seeding stopped; remote/file cleanup failed and remote links may remain until expiry";
        } catch (cause) { warning = cause instanceof Error ? cause.message : String(cause); }
        manifest = { ...manifest, ok: status !== "error", status, updatedAt: utcNow(), ...(error ? { error } : {}), ...(warning ? { warning } : {}) };
        await this.store.write(manifest);
        return manifest;
      });
      return stopPromise;
    };
    try {
      uploadFile = await abortable(this.createUploadFile(resolvedPath), startupSignal, file => file.dispose());
      const ice = await abortable(this.api.getIceConfig(startupSignal), startupSignal);
      peer = await abortable(this.createPeer(ice), startupSignal, latePeer => latePeer.destroy());
      const peerId = await waitForPeerOpen(peer, { signal: startupSignal });
      peer.on("error", (cause: Error) => { void cleanup("error", `Peer failed: ${cause.message}`).catch(() => {}); });
      channel = await abortable(this.api.createChannel(peerId, startupSignal), startupSignal, lateChannel => this.api.destroyChannel(lateChannel.shortSlug).then(() => {}));
      if (startupSignal.aborted) throw startupSignal.reason;
      const session = new UploaderSession({ files: [uploadFile], password: options.password });
      peer.on("connection", connection => { session.attach(connection); });
      manifest = { ...manifest, peerId, shortSlug: channel.shortSlug, longSlug: channel.longSlug, secret: channel.secret, shortUrl: this.api.channelUrl(channel.shortSlug), longUrl: this.api.channelUrl(channel.longSlug), status: "seeding", updatedAt: utcNow() };
      await this.store.write(manifest);
      clearTimeout(startupTimer);
      if (channel.secret) {
        const liveChannel = channel;
        let renewing = false;
        renewTimer = setInterval(() => {
          if (renewing || lifetime.signal.aborted) return;
          renewing = true;
          void this.api.renewChannel(liveChannel.shortSlug, liveChannel.secret!, lifetime.signal)
            .then(ok => { if (!ok) throw new Error("FilePizza refused channel renewal"); })
            .catch(cause => { if (!lifetime.signal.aborted) return cleanup("error", `Channel renewal failed: ${cause instanceof Error ? cause.message : String(cause)}`).then(() => {}); })
            .finally(() => { renewing = false; })
            .catch(cause => { process.stderr.write(`filepizza worker: failed to record renewal failure: ${String(cause)}\n`); });
        }, this.renewIntervalMs);
      }
      return { manifest, stop: () => cleanup("stopped") };
    } catch (error) {
      await cleanup(options.signal?.aborted ? "stopped" : "error", options.signal?.aborted ? undefined : error instanceof Error ? error.message : String(error));
      throw error;
    } finally { clearTimeout(startupTimer); }
  }
}
