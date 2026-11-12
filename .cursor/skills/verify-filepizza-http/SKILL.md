---
name: verify-filepizza-http
description: Model-check FilePizza API response, deadline, and cancellation behavior when changing FilePizzaApi.request or its fetch adapter contract.
---

# Verify FilePizza API deadlines

Once the configured deadline expires, a stalled response must stop blocking the caller even if the fetch adapter ignores abort. Otherwise a link operation can wait indefinitely for a response header or body.

Run with Java 11 or later and `TLA2TOOLS` set to the absolute path of the official [TLA+ 1.7.4 release JAR](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

```sh
sh scripts/check-cli-state-machine.sh .cursor/skills/verify-filepizza-http/Request.tla
```

## Coverage

Reviewed at `b89157a3dc71a933043e42a96b7af890bdf17827` and the cited `0.1.0` release at `6f289039c02044586be6914460a51679f434e9ec`.

| Model | Source |
| --- | --- |
| Headers arrive, JSON body arrives, or either step fails. | `src/filepizza-api.ts`, `FilePizzaApi.request` and its `operation` closure |
| The deadline or caller cancellation can settle the outer wait before the operation resolves. | `request`, `cancellation`, timeout callback, `cancel` and `Promise.race` |
| The underlying controller is aborted during settlement and the timer and listener are removed. | `request`, `finally` |
| The cited release waits for fetch and JSON without an internal deadline. | `FilePizzaApi` methods and `parseJsonResponse` in `0.1.0` |

The model begins at the first fetch of one request with no pre-existing abort. It considers all orderings between receiving headers, settling the body, the deadline, and external cancellation. A caller can separately reject before starting if its signal is already aborted. It abstracts Promise microtasks into settlement events, does not model response data, and assumes the event loop can run timers. In the legacy config, the deadline event represents a budget elapsing in the environment. The release never configured a timer of its own.

The current model passed all six distinct states. Both negative configurations left a caller waiting after the deadline. Removing the timeout callback's Promise rejection in a scratch copy made both the header and body deadline tests fail.

## Verify a change

1. Compare the covered methods against the reviewed commit, including when each Promise is able to settle.
2. Run the checker and interpret any trace with pstack's `/statechart`. Supply `.cursor/skills/verify-filepizza-http/Request-broken.cfg` as the second argument to check the missing Promise rejection, or use `Request-legacy.cfg` in the same directory to check the old unbounded wait. Both fail `DeadlineEndsCallerWait`.
3. In a disposable checkout, remove only `rejectCancellation(error)` from the timeout callback and run `npm test -- tests/filepizza-api.test.ts -t 'times out stalled'`. Both header and body fixtures must detect the still-pending call. Restore the callback and run `npm test -- tests/filepizza-api.test.ts`.
4. Advance the reviewed commit once the model matches the code.
