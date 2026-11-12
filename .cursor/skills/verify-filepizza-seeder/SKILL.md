---
name: verify-filepizza-seeder
description: Model-check FilePizza seeder startup, link publication, renewal, and cleanup when changing SeederService or how the upload manifest is persisted.
---

# Verify FilePizza seeder startup and cleanup

Once the upload manifest records a stop or failure, an older startup write should never mark that upload as seeding. A sender could otherwise see a ready link for a peer that has already shut down.

Run from the repository root with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-seeder/Seeder.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827`.

| Model | Source |
| --- | --- |
| File, ICE, peer and channel preparation | `src/seeder-service.ts`, `startUpload` before construction of `UploaderSession` |
| Seeding write starts and commits independently of cleanup | `startUpload`, assignment of the seeding manifest and the following `await this.store.write(manifest)`, plus `src/upload-store.ts`, `UploadStore.write` |
| Peer error, startup failure, cancellation, or stop starts cleanup | `startUpload`, the peer error callback, startup catch, and returned `stop` |
| One renewal at a time and rejection triggers cleanup | `startUpload`, renewal interval and the `renewing` and lifetime guards |
| Cleanup closes the peer, awaits bounded cleanup and writes the terminal manifest | `startUpload`, the shared `stopPromise` and the body of `cleanup` |

TLC explores one upload on the channel path with a renewal secret. One startup write and one terminal write can be in flight. A successful same-directory rename is the point at which a manifest becomes visible. A failure to open a resource, interruption before the seeding write, and a remote cleanup warning are represented by outcomes. The model assumes a working manifest filesystem and a peer whose `destroy` completes normally. It does not model WebRTC, renewal deadlines, the worker's polling loop, or asynchronous file and channel acquisition after abort.

## Known finding

`TerminalRecordStaysTerminal` fails on the reviewed commit. A peer fails while the seeding manifest is waiting to be written. Cleanup destroys the peer and records the failure. The original write then records seeding again. pstack's `/statechart` explored 44 states, found the eight-step path, and checked `NoDeadlock`.

To replay in a disposable checkout with dependencies installed, copy [the local fixture](references/seeder-trace.test.ts) to `tests/formal-seeder-trace.test.ts` and run `npm test -- tests/formal-seeder-trace.test.ts tests/seeder-lifecycle.test.ts`. The fixture delays the seeding manifest write and uses the real `UploadStore` and a fake peer. It observed the terminal record first and the stale record second. Its assertions describe the behavior on the reviewed commit.

## Release cited by Freedom Skills

`SeederLegacy.tla` models `0.1.0` at `6f289039c02044586be6914460a51679f434e9ec`. It follows acquisition through file, ICE, peer, channel and manifest, models up to two concurrent renewal callbacks, and distinguishes successful and failed startup cleanup. On a normal stop, the release awaits remote channel deletion before it closes the local peer. The teardown budget in the model is an elapsed interval observed outside the operation. The model assumes successful local resource disposal and abstracts the worker's exit and store I/O.

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-seeder/SeederLegacy.tla
```

`LocalPeerStopsWithinCleanupBudget` fails when the remote deletion is still pending after a stop. To replay the ordering, replace only `src/seeder-service.ts` in the disposable main checkout with the release module and run `npm test -- tests/formal-seeder-trace.test.ts -t 'closes the local peer'`. The fixture observed that the release had made no call to destroy the peer when remote deletion began. The current source passed after restoration.

## Peer readiness watchers

`PeerReady.tla` models `waitForPeerOpen` in `src/node-peer.ts`. The waiter checks for an already-aborted signal or known peer ID, then settles on open, error, abort, or timeout. It assumes a PeerJS peer that implements `off`. The current model exhausted 12 states with all watchers removed on settlement. The broken config leaves the open callback attached. The legacy config reflects the release removing only the opposite event's callback.

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-seeder/PeerReady.tla
```

Use `PeerReady-broken.cfg` or `PeerReady-legacy.cfg` from the same directory as the second argument to check the expected violation. Copy [the local fixture](references/peer-open-trace.test.ts) to `tests/formal-peer-open.test.ts` in a disposable checkout and run `npm test -- tests/formal-peer-open.test.ts`. The fixture detects an open callback left attached if `peer.off?.("open", onOpen)` is removed or if the release module is substituted.

## Verify a change

1. Compare the covered methods with the reviewed commit, paying particular attention to where each manifest is captured and which asynchronous write can finish last.
2. Run the checker and interpret the result with pstack's `/statechart`. Replay each changed counterexample using the local fixture. If the bug was deliberately fixed, assert that the terminal status survives releasing the old write.
3. Advance the reviewed commit only after checking the model against the implementation.
