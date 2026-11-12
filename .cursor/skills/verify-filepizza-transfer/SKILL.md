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

## Verify a change

1. Compare the covered methods with the reviewed commit. Update the actions at each changed callback, await boundary, or guard.
2. Run the checked config. If TLC reports a trace, use pstack's `/statechart` and replay the sequence with a deferred `readRange` using `tests/uploader-session.test.ts`.
3. Run the same checker with `.cursor/skills/verify-filepizza-transfer/Transfer-broken.cfg` as the second argument. It must fail `OnlyCurrentReadsSend`. For a source-level check in a disposable copy, remove only the guard after `await file.readRange` and run `npm test -- tests/uploader-session.test.ts -t 'does not send a late chunk after pause'`. The test must observe the stale send. Restore the guard and rerun both normal checks.
4. Record the new reviewed commit only after confirming the actions and property still describe the code.
