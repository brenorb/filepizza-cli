---
name: verify-filepizza-share
description: Model-check how the FilePizza share, status, and stop commands supervise a detached worker, especially when changing readiness, interruption, or cooperative stop.
---

# Verify FilePizza worker supervision

The current `stop` command must refuse to send a cooperative stop request to an active worker that predates the stop-marker protocol. Otherwise the CLI asks a worker to stop through a channel it cannot read and the command times out.

Run from the repository root with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-share/Share.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827`.

| Model | Source |
| --- | --- |
| Validate a file, spawn a detached worker and wait for a ready link, failure, timeout or interruption. | `src/cli.ts`, `share` action, and `src/lifecycle.ts`, `startShare` |
| A manifest that says starting or seeding is materialized as stopped when its PID is absent. | `src/cli.ts`, `status` action, and `src/upload-store.ts`, `materializeManifestStatus` |
| Read the manifest, refuse an unsupported worker, write the stop marker, then poll for completion. | `src/cli.ts`, `stop` action, and `src/lifecycle.ts`, `stopShare` |
| Observe the marker, cancel startup or stop the ready peer, and clear the marker. | `src/worker-runtime.ts`, `runBackgroundWorker`, and `src/worker.ts` |

TLC explores one upload, at most one foreground share and one independent stop invocation, and one optional existing legacy worker. It treats successful manifest reads and writes as snapshots at their completion, assumes any ready record has both URLs, and assumes the OS liveness check refers to the same worker. Marker I/O errors and multiple simultaneous stop invocations are outside these bounds. Resource acquisition and overlapping seeding/terminal manifest writes are covered by the [seeder skill](../verify-filepizza-seeder/SKILL.md).

The baseline exhausted 298 states. The broken config reaches a marker write for a legacy worker in two steps. Removing the `controlVersion` guard from `stopShare` in a scratch copy made the real test report a timeout instead of rejecting the legacy worker immediately. The ten lifecycle and worker-runtime tests passed after restoring the guard.

## Release cited by Freedom Skills

`ShareLegacy.tla` models `0.1.0` at `6f289039c02044586be6914460a51679f434e9ec`. In `src/cli.ts`, `waitForUploadReady` accepts both URLs after it materializes PID liveness. The corresponding `materializeManifestStatus` maps a seeding record with a dead PID to stopped. The model allows the worker to exit before the next poll and represents `stop` as signal delivery and a wait for the terminal record. It assumes PIDs identify their original worker while live and abstracts OS signal failures and upload store errors.

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-share/ShareLegacy.tla
```

`PrintedShareWasSeeding` fails after five steps. The worker records both URLs and exits, then `share` prints the stopped record as a successful response.

To replay the read in a disposable checkout of `0.1.0`, copy [the local worker fixture](references/ended-worker.ts) to `src/worker.ts` and install the CLI dependencies. Point `FILEPIZZA_CLI_HOME` at an empty temporary directory and run `node --import tsx src/cli.ts share package.json --timeout 5`. The fixture writes a valid seeding record with the PID of an already-exited local process. The real CLI exits successfully with `status: "stopped"`, `alive: false`, and both URLs.

## Verify a change

1. Compare the covered methods with the reviewed commit. Update the model when the boundary between a worker event, record observation, or stop request changes.
2. Run the checker and interpret counterexamples using pstack's `/statechart`.
3. Supply `.cursor/skills/verify-filepizza-share/Share-broken.cfg` as the second argument to confirm the invariant detects a missing version check. For source replay in a disposable checkout, remove the guard and run `npm test -- tests/lifecycle.test.ts -t 'refuses to signal legacy active workers'`. Restore the guard and run `npm test -- tests/lifecycle.test.ts tests/worker-runtime.test.ts`.
4. Advance the reviewed commit after verifying that the model matches the code.
