import wrtcPkg from "@roamhq/wrtc";
import type { IceConfig } from "./filepizza-api.js";

export type PeerLike = {
  id?: string;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
  destroy(): void;
};

export async function createPeerFromIce(ice: IceConfig): Promise<PeerLike> {
  installBrowserLikeGlobals();
  const peerjsModule = await import("peerjs");
  const peerjsExport = (peerjsModule as unknown as { default?: unknown }).default ?? peerjsModule;
  const PeerConstructor = (peerjsExport as { Peer?: new (options: object) => PeerLike }).Peer;

  if (!PeerConstructor) {
    throw new Error("PeerJS Peer constructor was not available");
  }

  return new PeerConstructor({
    host: ice.host,
    path: ice.path,
    secure: true,
    config: {
      iceServers: ice.iceServers,
    },
    debug: 2,
  });
}

export function installBrowserLikeGlobals(): void {
  const globals = globalThis as Record<string, unknown>;

  globals.window ??= globalThis;
  globals.location ??= new URL("https://file.pizza/");
  globals.RTCPeerConnection ??= wrtcPkg.RTCPeerConnection;
  globals.RTCSessionDescription ??= wrtcPkg.RTCSessionDescription;
  globals.RTCIceCandidate ??= wrtcPkg.RTCIceCandidate;
  globals.MediaStream ??= wrtcPkg.MediaStream;
  globals.MediaStreamTrack ??= wrtcPkg.MediaStreamTrack;

  if (!globals.FileReader) {
    globals.FileReader = class NodeFileReader {
      onload: ((event: { target: { result: ArrayBuffer } }) => void) | null = null;

      readAsArrayBuffer(blob: Blob): void {
        void blob.arrayBuffer().then((result) => {
          this.onload?.({ target: { result } });
        });
      }
    };
  }
}

export async function waitForPeerOpen(peer: PeerLike): Promise<string> {
  if (peer.id) {
    return peer.id;
  }

  return await new Promise<string>((resolve, reject) => {
    const onOpen = (id: string) => {
      peer.off?.("error", onError);
      resolve(id);
    };
    const onError = (error: Error) => {
      peer.off?.("open", onOpen);
      reject(error);
    };

    peer.on("open", onOpen);
    peer.on("error", onError);
  });
}
