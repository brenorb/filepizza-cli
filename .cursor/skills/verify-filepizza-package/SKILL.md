---
name: verify-filepizza-package
description: Check clean-before-build behavior and the packaged filepizza executable when editing npm lifecycle scripts.
---

# Verify the packaged FilePizza CLI

At `b89157a` and the cited `0.1.0`, `package.json` declares `dist/cli.js` as the `filepizza` executable. `prepare` builds through TypeScript. `prepack` cleans generated output and coverage, then builds again. An unsuccessful lifecycle command blocks packaging. The tarball's publish allowlist includes `dist`.

```sh
dir=.cursor/skills/verify-filepizza-package
sh scripts/check-cli-state-machine.sh "$dir/Pack.tla"
sh scripts/check-cli-state-machine.sh "$dir/Pack.tla" "$dir/Pack-mutant.cfg"
```

The model bounds one package run, a stale artifact and a new build that can fail. The mutant skips cleaning and must violate `FreshEntrypoint`. In a disposable checkout with dependencies installed, run `python3 path/to/check-pack.py`. The fixture places a stale artifact in `dist`, packs locally with npm, and inspects the actual manifest and files in the temporary tarball. It must fail if the `npm run clean &&` stage is removed from `prepack`. Registry publication, external dependencies, and TypeScript internals are outside the model.
