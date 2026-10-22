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
- concise human output, with explicit JSON output for scripts
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

Commands print a concise result to stdout and diagnostics to stderr. Use
`--json` on `share`, `status`, or `stop` to obtain the upload manifest as JSON:

```bash
npx filepizza-cli status <upload-id> --json
npx filepizza-cli share ./report.pdf --json > share.json
```

**Script migration:** earlier versions emitted JSON by default. Add `--json`
to existing automation. The manifest fields are unchanged; a manifest may
contain the share's internal secret, so store JSON output privately.

`--quiet` suppresses startup progress without hiding results or errors.
`share` and `stop` accept a finite positive `--timeout` in seconds (defaults:
30 and 15 respectively). Usage errors exit with status 2; operational errors
and failed uploads exit with status 1. Successful commands and help exit 0.
Argument validation runs before a background worker starts.

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

## Reference

- Upstream app and protocol: <https://github.com/kern/filepizza>
