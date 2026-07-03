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
- JSON output for agent consumption
- local manifest state under `~/.cache/filepizza-cli/uploads/`

## Usage

Build once:

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

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Reference

- Upstream app and protocol: <https://github.com/kern/filepizza>
