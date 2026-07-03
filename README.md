# filepizza-cli

Small Node CLI for creating and seeding FilePizza uploads without driving a browser.

## Status

This repo is being built test-first against the public `https://file.pizza/` protocol surface described in `kern/filepizza`.

Current milestones:

- create and renew FilePizza channels over HTTP
- establish a programmatic uploader peer
- expose short and long share URLs
- keep a background seeder alive
- support `status` and `stop`

## Development

```bash
npm install
npm test
npm run typecheck
```

## Reference

- Upstream app and protocol: <https://github.com/kern/filepizza>
