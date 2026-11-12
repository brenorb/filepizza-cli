# Download, pause, and resume

The chart follows one recipient from opening a FilePizza download through pausing, restarting, receiving the final piece, or losing the connection.

[Mermaid chart](download.mmd) · [Verification skill](../../.cursor/skills/verify-filepizza-transfer/SKILL.md)

pstack's `/statechart` checked all 111 distinct states of the one-recipient configuration. `OnlyCurrentReadsSend` and `NoDeadlock` held. The projection hides steps that leave the recipient in the same visible state, including discarded reads and final stuttering. The two-recipient check and the source-level mutation are documented in the verification skill.

To regenerate in a scratch directory, copy `Transfer.tla` and `Transfer-chart.cfg` from the verification skill and copy `download.view.mjs` from this directory. Use pstack at `5866df557357d005b3c0c9d3da0d9e739b4bdde3` and the same pinned TLC JAR as the verification skill.

```sh
"$PSTACK_STATECHART" Transfer.tla --config Transfer-chart.cfg --view download.view.mjs --out filepizza-download
```
