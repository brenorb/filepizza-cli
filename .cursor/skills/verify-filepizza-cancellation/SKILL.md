---
name: verify-filepizza-cancellation
description: Model-check cancellation of FilePizza startup and polling work when changing abortable, delay, or cleanup of late resources.
---

# Verify FilePizza cancellation cleanup

If a resource arrives after the caller was cancelled, its cleanup callback must still be scheduled. Otherwise a cancelled share can retain an open file, peer, or channel.

Run with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-cancellation/Cancellation.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827`.

| Model | Source |
| --- | --- |
| Cancellation rejects the caller's wait while the resource-creation Promise can still be pending. | `src/async-control.ts`, `abortable`, abort handler and Promise handlers |
| A late successful result queues the configured cleanup. | `abortable`, success handler after cancellation |
| Cancellation clears the polling timer and prevents normal completion. | `src/async-control.ts`, `delay` |
| Concrete late cleanup releases a file, destroys a peer, or asks the service to delete a channel. | `src/seeder-service.ts`, `startUpload` and its three resource acquisition calls |

The model bounds a single resource or timer operation with a signal. It includes an already-aborted signal, cancellation while work is pending, success and failure. For resources it assumes a cleanup callback was supplied. It checks that cleanup is queued, leaving the cleanup result and external resource lifetime outside the property.

The current model passed all ten distinct states. The model mutation loses a resource that arrives after cancellation. Removing the late-cleanup callback in scratch source made the file-disposal test fail.

## Verify a change

1. Compare the covered methods against the reviewed commit, including the Promise callbacks and calls that own resource disposal.
2. Run the checker and interpret traces using pstack's `/statechart`. As a negative check, supply `.cursor/skills/verify-filepizza-cancellation/Cancellation-broken.cfg` as the second argument. It must reach a late resource without cleanup.
3. In a disposable checkout, skip the cleanup callback when `cancelled` is true in `abortable`. Run `npm test -- tests/seeder-lifecycle.test.ts -t 'resolves after startup cancellation'`. The test must observe no disposal call. Restore the callback and run the complete seeder lifecycle test file.
4. Advance the reviewed commit after checking that the model still describes the code.
