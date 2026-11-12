# Share, status, and stop

[Mermaid chart](share.mmd) · [Verification skill](../../.cursor/skills/verify-filepizza-share/SKILL.md)

![FilePizza share, status, and stop](share.svg)

pstack's `/statechart` checked 287 distinct states of a newly started share. Both configured checks held. The chart groups worker startup polling, repeated status observations, and stop-marker bookkeeping into visible states. It includes the case where the share command times out but the detached worker later makes the link available. It assumes a valid manifest filesystem and models cooperative workers on the current branch.

To regenerate in a scratch directory, copy `Share.tla` and `Share-chart.cfg` from the verification skill and copy `share.view.mjs` from this directory. Use pstack at `5866df557357d005b3c0c9d3da0d9e739b4bdde3` and the same pinned TLC JAR as the verification skill.

```sh
"$PSTACK_STATECHART" Share.tla --config Share-chart.cfg --view share.view.mjs --out filepizza-share
```
