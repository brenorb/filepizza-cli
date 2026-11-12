---
name: verify-filepizza-store
description: Model-check FilePizza upload manifest and stop-marker publication when changing UploadStore writes, reads, or cleanup.
---

# Verify FilePizza manifest snapshots

A read during an update must see a complete manifest or an absent record. Otherwise a poller can mistake an in-progress write for a corrupt upload.

Run with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-store/Manifest.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827` and the cited `0.1.0` release at `6f289039c02044586be6914460a51679f434e9ec`.

| Model | Source |
| --- | --- |
| A writer prepares new contents under a private temporary filename, then renames them over the destination. | `src/upload-store.ts`, `UploadStore.write` |
| A failed write leaves the destination untouched and removes the temporary path. | `UploadStore.write`, `finally` |
| The reader observes an absent record or a JSON snapshot. | `UploadStore.read` |
| A stop marker progresses from staged to visible or failed. The worker can remove a published marker. | `UploadStore.requestStop`, `isStopRequested`, and `clearStopRequest` |
| The cited release opens the destination directly and does not implement a cooperative stop marker. | `UploadStore.write` and `UploadStore.read` in `0.1.0` |

The model bounds one upload, two competing manifest writers, one observer, and at most one stop-marker request. It assumes same-directory rename is atomic and represents each complete manifest as an opaque value. Its scope is visibility to a concurrent reader. The [seeder skill](../verify-filepizza-seeder/SKILL.md) checks status ordering.

The current model passed all 500 distinct states. The cited release failed the model and the fixture. The fixture observed invalid JSON between the opening and completion of the release write.

## Verify a change

1. Compare the covered methods with the reviewed commit and check any changed filesystem or await boundary.
2. Run the checker. Run it again with `.cursor/skills/verify-filepizza-store/Manifest-legacy.cfg` as the second argument. The legacy config fails when a writer opens the destination and a reader sees incomplete contents. Use pstack's `/statechart` to inspect the trace.
3. In a disposable checkout with dependencies installed, copy [the local fixture](references/manifest-trace.test.ts) to `tests/formal-manifest-trace.test.ts` and run `npm test -- tests/formal-manifest-trace.test.ts tests/upload-store-contract.test.ts`. The fixture pauses the filesystem write after opening its target. Replacing `src/upload-store.ts` with the cited release module makes the fixture fail while reading the incomplete record. Restore the current module and rerun.
4. Update the reviewed commit after confirming the model matches the code.
