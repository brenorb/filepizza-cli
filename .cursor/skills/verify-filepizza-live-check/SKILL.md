---
name: verify-filepizza-live-check
description: Model-check the FilePizza live-test CLI when changing its recipient flow, byte verification, upload discovery, or cleanup.
---

# Verify the FilePizza live-check entrypoint

The live check may print a success record only when the downloaded bytes match the original fixture. Otherwise a broken transfer can be reported as working.

Run with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-live-check/LiveCheck.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827`.

| Model | Source |
| --- | --- |
| Share the fixture, check the recorded worker, connect a recipient, and receive chunks until the final piece. | `scripts/e2e-live.mjs`, first half of the main `try` and the connection callbacks |
| Compare reconstructed bytes, require multiple chunks, and print success. | `assert.deepEqual`, chunk-count assertion, and JSON report |
| Destroy the recipient, recover an upload ID if necessary, request a stop, wait for worker exit, and remove scratch state. | The two cleanup blocks in `finally` |
| Cleanup errors affect exit status, including after a success record was printed. | `resultCode`, cleanup catches, and `process.exit` |

The model bounds a single fixture upload and recipient. It groups request, connection, deadline, and cleanup failures into observable outcomes. It represents the reconstructed bytes by exact equality and the number of chunks by whether more than one arrived. Actual network and filesystem timing are outside these bounds.

The baseline exhausted 28 states. The mutation reaches a success record with mismatched data. A local run of the real script against a fake package verified that the script rejects a one-byte mismatch and accepts the exact fixture. Removing its byte equality assertion made the same fixture observe unexpected success.

## Verify a change

1. Compare the script against the reviewed commit and check that its success and cleanup actions still match the model.
2. Run the checker. Supply `.cursor/skills/verify-filepizza-live-check/LiveCheck-broken.cfg` as the second argument and confirm it fails `SuccessReportsAnExactTransfer`. Inspect the trace using pstack's `/statechart`.
3. Run `node .cursor/skills/verify-filepizza-live-check/references/check-live-script.mjs`. For the source mutation, remove only `assert.deepEqual(downloaded, expected)` in a scratch copy and pass that script's path to the fixture. The fixture must catch the false success.
4. Advance the reviewed commit after confirming the model matches the implementation.
