---
name: verify-filepizza-transfer
description: Model-check FilePizza's per-recipient download scheduling when changing UploaderSession start, pause, chunk reads, timers, close, or error handling.
---

# Verify FilePizza download scheduling

A file read that finishes after its download was paused, restarted, or closed must never send a chunk for the old transfer. Otherwise the recipient can receive stale bytes after changing the download or closing it.

Run from the repository root with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-transfer/Transfer.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827`.

| Model | Source |
| --- | --- |
| `StartTransfer` allocates the next transfer generation and invalidates any timer. | `src/uploader-session.ts`, `startTransfer` and `clearPendingChunk` |
| `ReadCompletes` and `DiscardRead` decide whether a completed asynchronous file read can send. | `src/uploader-session.ts`, `sendNextChunk` before and after `file.readRange` |
| `RunTimer` starts the next read. | `src/uploader-session.ts`, timer inside `sendNextChunk` |
| `PauseTransfer`, `FinishDownload`, `PeerDisconnected`, and `TransferFailed` invalidate only the affected recipient. | `src/uploader-session.ts`, `attach`, `handleIncoming`, `clearPendingChunk`, and `failConnection` |

TLC explores two connections, at most two accepted starts per connection, and two chunks per file. A start may resume at the final chunk. An in-flight read survives invalidation until it settles. The model represents a pause as loss of activity and a restart as an epoch change. Together these stand in for increments of the generation counter. The model assumes the normal synchronous return from `connection.send` and uses a peer failure event for read/send rejection, malformed data, and transport errors. It abstracts file bytes, timer durations, the metadata exchange, and protocol handling inside WebRTC.

The baseline exhausted 7,073 distinct states. With the post-read guard disabled in the model, TLC found a stale send after two starts. Removing the corresponding source guard in a scratch copy made the existing deferred-read test observe a chunk after pause. The nine uploader-session tests passed after restoring the guard.

## Release cited by Freedom Skills

Freedom Skills pins FilePizza `0.1.0`, source commit `6f289039c02044586be6914460a51679f434e9ec`. `TransferLegacy.tla` models that release's `UploaderSession`: `sendChunkTimeout` holds a single shared reference, so clearing it can cancel another recipient's scheduled piece. A read already in flight can still send after its transfer becomes inactive. `reads` and `timers` track outstanding callbacks independently of the shared handle. The model assumes two recipients, two chunks, up to two starts per recipient, and successful reads and sends.

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-transfer/TransferLegacy.tla
```

The command reports the first violation. pstack's `/statechart` reached 21,985 states, reported both three-step counterexamples, and checked `NoDeadlock`. See the [release chart](../../../docs/statecharts/download-legacy.md).

The release source reproduced a late send and interference between recipients in a local fixture. To compare, use a disposable checkout of the reviewed main commit with dependencies installed. Replace only `src/uploader-session.ts` with `git show 6f289039c02044586be6914460a51679f434e9ec:src/uploader-session.ts`, then run `npm test -- tests/uploader-session.test.ts -t 'late chunk after pause|chunk scheduling between two peers'`. Both tests fail on the release module and pass on the reviewed main module.

## Verify a change

1. Compare the covered methods with the reviewed commit. Update the actions at each changed callback, await boundary, or guard.
2. Run the checked config. If TLC reports a trace, use pstack's `/statechart` and replay the sequence with a deferred `readRange` using `tests/uploader-session.test.ts`.
3. Run the same checker with `.cursor/skills/verify-filepizza-transfer/Transfer-broken.cfg` as the second argument. It must fail `OnlyCurrentReadsSend`. For a source-level check in a disposable copy, remove only the guard after `await file.readRange` and run `npm test -- tests/uploader-session.test.ts -t 'does not send a late chunk after pause'`. The test must observe the stale send. Restore the guard and rerun both normal checks.
4. Record the new reviewed commit only after confirming the actions and property still describe the code.
