import { basename, resolve } from "node:path";
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
};

export type StartedUpload = {
  manifest: UploadManifest;
  stop(): Promise<UploadManifest>;
};

export class SeederService {
  readonly api: Pick<FilePizzaApi, "getIceConfig" | "createChannel" | "renewChannel" | "destroyChannel" | "channelUrl">;
  readonly createPeer: (ice: IceConfig) => Promise<PeerLike>;
  readonly createUploadFile: (filePath: string) => Promise<DisposableUploadFile>;
  readonly store: UploadStore;
  readonly renewIntervalMs: number;

  constructor(deps: SeederServiceDependencies = {}) {
    this.api = deps.api ?? new FilePizzaApi();
    this.createPeer = deps.createPeer ?? createPeerFromIce;
    this.createUploadFile = deps.createUploadFile ?? createNodeUploadFile;
    this.store = deps.store ?? new UploadStore();
    this.renewIntervalMs = deps.renewIntervalMs ?? 60_000;
  }

  async startUpload(options: {
    uploadId: string;
    filePath: string;
    password?: string;
  }): Promise<StartedUpload> {
    const resolvedPath = resolve(options.filePath);
    const initialManifest: UploadManifest = {
      ok: true,
      uploadId: options.uploadId,
      filePath: resolvedPath,
      fileName: basename(resolvedPath),
      pid: process.pid,
      status: "starting",
      startedAt: utcNow(),
      updatedAt: utcNow(),
    };
    await this.store.write(initialManifest);

    let peer: PeerLike | null = null;
    let uploadFile: DisposableUploadFile | null = null;
    let channel: Channel | null = null;
    let renewTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    try {
      uploadFile = await this.createUploadFile(resolvedPath);
      const ice = await this.api.getIceConfig();
      peer = await this.createPeer(ice);
      const peerId = await waitForPeerOpen(peer);
      channel = await this.api.createChannel(peerId);

      const session = new UploaderSession({
        files: [uploadFile],
        password: options.password,
      });
      peer.on("connection", (connection) => {
        session.attach(connection);
      });

      if (channel?.secret) {
        const renewalChannel = channel;
        renewTimer = setInterval(() => {
          void this.api.renewChannel(renewalChannel.shortSlug, renewalChannel.secret!);
        }, this.renewIntervalMs);
      }

      const manifest: UploadManifest = {
        ...initialManifest,
        peerId,
        shortSlug: channel.shortSlug,
        longSlug: channel.longSlug,
        secret: channel.secret,
        shortUrl: this.api.channelUrl(channel.shortSlug),
        longUrl: this.api.channelUrl(channel.longSlug),
        status: "seeding",
        updatedAt: utcNow(),
      };
      await this.store.write(manifest);

      const stop = async (): Promise<UploadManifest> => {
        if (stopped) {
          return await this.store.read(options.uploadId);
        }
        stopped = true;

        if (renewTimer) {
          clearInterval(renewTimer);
        }
        if (channel?.shortSlug) {
          await this.api.destroyChannel(channel.shortSlug).catch(() => {});
        }
        peer?.destroy();
        await uploadFile?.dispose().catch(() => {});

        const stoppedManifest: UploadManifest = {
          ...(await this.store.read(options.uploadId)),
          status: "stopped",
          updatedAt: utcNow(),
        };
        await this.store.write(stoppedManifest);
        return stoppedManifest;
      };

      return { manifest, stop };
    } catch (error) {
      if (renewTimer) {
        clearInterval(renewTimer);
      }
      peer?.destroy();
      await uploadFile?.dispose().catch(() => {});
      if (channel?.shortSlug) {
        await this.api.destroyChannel(channel.shortSlug).catch(() => {});
      }

      const failedManifest: UploadManifest = {
        ...initialManifest,
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: utcNow(),
      };
      await this.store.write(failedManifest);
      throw error;
    }
  }
}
