import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { waitForPeerOpen } from "../src/node-peer.js";

it("removes both readiness watchers when the peer opens", async () => {
  const peer = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const waiting = waitForPeerOpen(peer);
  peer.emit("open", "fixture-peer");
  await expect(waiting).resolves.toBe("fixture-peer");
  expect(peer.listenerCount("open")).toBe(0);
  expect(peer.listenerCount("error")).toBe(0);
});
