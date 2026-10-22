# CLI design and guideline checks

This release applies the [Command Line Interface Guidelines](https://clig.dev/)
to Filepizza's short-lived commands and detached seeder. The table records
applicable behavior and deliberate compatibility decisions.

| Area | Behavior and evidence |
| --- | --- |
| Basics/arguments | Commander handles strict operands, unknown flags, `--`, version, help and syntax exit2. Finite positive duration validation rejects unit suffixes, zero, negative numbers and overflow before a worker starts. JSON/plain modes conflict. |
| Help/discovery | Bare root and command names show successful help; help overrides unrelated validation. Examples and docs/issues links appear in root/command help. Global options before a command and command-like operands do not select the wrong help target. |
| Documentation | README includes installation, output modes, environment paths, recovery, cancellation and legacy worker behavior. Installed help is available offline; man pages/completions remain optional future additions. |
| Output | Humans see readable terminal results; existing nonterminal JSON pipelines retain their default. Explicit `--json`/`--plain` select a mode. Results use stdout; progress, errors and cleanup warnings use stderr. `--quiet` suppresses startup progress and keeps errors. There is no color, spinner or terminal escape formatting outside help supplied by Commander. |
| Errors/signals | Success/help/version return0, syntax2, operational/failed share1 and interrupted foreground share130. EPIPE exits quietly with0. Errors carry recovery commands/IDs for uncertain background outcomes. API errors avoid echoing server bodies or secrets. |
| Interactivity | No commands prompt. Shares use local file paths; a path is required for long-lived random access by the detached worker. Ctrl-C during startup requests cooperative shutdown; stopped manifests cannot signal unrelated processes. |
| Robustness | HTTP deadlines cover fetch and JSON response bodies, with removable external abort listeners. Peer startup and entire worker startup are bounded. Spawn errors, early worker exit, cancellation and dead/terminal readiness are handled. Local peer serving stops before bounded remote/file cleanup, which records warnings when incomplete. Renewal failures are handled and recorded. Invalid peer frames, offsets, send/read failures and late transfer chunks are contained per connection. |
| Future compatibility | Command names, file paths, manifest output and existing JSON pipeline defaults remain. Terminal human output is additive and explicit flags are available. New workers add cooperative control metadata. Older active workers are recognized with actionable manual-stop guidance because signalling an unverified PID is unsafe. |
| Configuration/environment | Absolute XDG_CACHE_HOME relocates cache; empty/relative values use the default. FILEPIZZA_CLI_HOME preserves existing override semantics. Manifest/stop marker writes are atomic and private; IDs and JSON schemas are validated before use. Status derives process liveness but process IDs are never used as shutdown authority. |
| Naming/distribution | Existing `filepizza` binary and npm package remain. Version0.2.0 documents additive output/control features. Build/typecheck and npm packaging checks cover emitted CLI/worker/helper modules. Packaged worker selection uses the entry point extension, so installs below a directory named src still start worker.js without a development-only loader. |
| Analytics | No analytics or implicit update checks are added. Help/status work offline and do not open remote connections. Network access is explicit through sharing workers. |

## Verification

```bash
npm ci
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Tests use fake HTTP responses, stores, peers and workers. They cover request
and stalled-body deadlines, external cancellation even with uncooperative
fetch mocks, private atomic state, invalid schemas, startup/teardown resources,
renewal failures, worker control markers, stdout modes, strict arguments and
closed pipes. A real disposable process checks that a stale PID in a stopped
record is preserved. An actual pseudo-terminal status invocation confirms the
terminal human default; redirected process tests confirm compatible JSON.
For separate live verification, pack/install the production package and run
`node scripts/e2e-live.mjs /path/to/node_modules/filepizza-cli`. This creates a
generated public fixture, starts the installed CLI's detached worker against
the hosted FilePizza service, downloads through a separate native WebRTC peer,
checks all bytes across multiple frames, and stops the share through the CLI.
It requires network access and the platform's native WebRTC binding. It is a
manual check, since public service availability is outside this repository.
