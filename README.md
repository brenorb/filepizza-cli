# filepizza-cli

Small Node CLI for creating and seeding FilePizza uploads without driving a browser.

## Status

This repo is being built test-first against the public `https://file.pizza/` protocol surface described in `kern/filepizza`.

Current milestones:

- create and renew FilePizza channels over HTTP
- establish a programmatic uploader peer
- expose short and long share URLs
- keep a background seeder alive
- support `share`, `status`, and `stop`

Current scope:

- single-file uploads
- human output on terminals, with compatible JSON output in pipelines
- local manifest state under `~/.cache/filepizza-cli/uploads/`

## Usage

Run `filepizza` for a short introduction, `filepizza --help` for all commands,
or `filepizza help share` for command help. `--version` reports the installed
package version. Help includes examples and links to documentation and issues.

Install-free with npm:

```bash
npx filepizza-cli share /absolute/path/to/file
npx filepizza-cli status <upload-id>
npx filepizza-cli stop <upload-id>
```

Commands print human-readable results when stdout is a terminal. Redirected
or piped stdout retains the original JSON default. Diagnostics use stderr.
Use `--json` to request JSON explicitly, or `--plain` to force human-readable
output even when redirected. These flags are mutually exclusive:

```bash
npx filepizza-cli status <upload-id> --json
npx filepizza-cli share ./report.pdf --json > share.json
```

**Compatibility in 0.2.0:** existing JSON pipelines keep their default format.
Interactive terminals gain human-readable output; callers can select an
explicit mode with `--json` or `--plain`. Manifests may include additional
control/warning fields and the share's internal secret, so store JSON privately.

`--quiet` suppresses startup progress without hiding results or errors.
`share` and `stop` accept a finite positive `--timeout` in seconds (defaults:
30 and 15 respectively). Usage errors exit with status 2; operational errors
and failed uploads exit with status 1. Successful commands and help exit 0.
Argument validation runs before a background worker starts. `--` ends option
parsing for a filename or upload ID that begins with a dash.

`share --request-timeout SECONDS` bounds each HTTP request, including its JSON
response body (default 10 seconds, maximum 2147483.647). Worker startup is
bounded at 30 seconds, including peer connection. `share --timeout` controls
only how long the foreground command waits: a timeout retains the background
worker and prints its upload ID with `status` and `stop` recovery commands.
Check status before retrying to avoid creating duplicate shares.

Ctrl-C while waiting for `share` requests cooperative worker shutdown and exits
130. New workers poll a private per-upload stop marker during startup and
seeding. `stop` never sends a signal to a stored PID, which may have been reused
by another process. Already stopped/error records are not signalled. Active
workers from older releases lack cooperative stop support; the command asks
you to inspect and stop that older worker manually. A pending stop request
remains valid if the foreground `stop --timeout` expires.

Shutdown stops local serving immediately and bounds remote/file cleanup at
five seconds. If remote channel deletion fails or times out, local state
records a warning; remote links may remain until expiry. Renewal failures stop
local serving and persist an error, visible through `status`. A stopped
worker is never reported as a ready share. Malformed peer messages and failed
transfers close the affected connection without crashing other downloads.

Local build:

```bash
npm install
npm run build
```

Create a share URL:

```bash
node dist/cli.js share /absolute/path/to/file
```

Inspect an upload:

```bash
node dist/cli.js status <upload-id>
```

Stop seeding:

```bash
node dist/cli.js stop <upload-id>
```

## Local state

Manifests live under `$XDG_CACHE_HOME/filepizza-cli/uploads/` when
`XDG_CACHE_HOME` is absolute; otherwise the default is
`~/.cache/filepizza-cli/uploads/`. Empty and relative XDG values use the
default. The existing `FILEPIZZA_CLI_HOME` override takes precedence and uses
`$FILEPIZZA_CLI_HOME/.cache/filepizza-cli/uploads/` for compatibility.

Manifest writes replace private temporary files atomically; upload directories
use mode 0700 and manifests 0600 on POSIX. Upload IDs are validated before
filesystem access. Invalid JSON or manifest fields produce an actionable
error; restore a known-good backup or remove the corrupt record after checking
whether its worker is still active. Protect JSON output and backups because
they may include internal share secrets.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

See [CLI design notes](docs/cli-design.md) for the guideline decisions and
regression coverage. Use the existing upstream protocol tests plus live peers
for an interoperability check; offline tests do not prove public relay service
availability.

## Reference

- Upstream app and protocol: <https://github.com/kern/filepizza>
