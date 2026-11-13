------------------------------- MODULE Pack --------------------------------
CONSTANT CleanBeforeBuild
VARIABLES phase, stale, current
vars == <<phase, stale, current>>

Init == /\ phase = "start" /\ stale \in BOOLEAN /\ current = FALSE
Prepare ==
  /\ phase = "start"
  /\ phase' = "ready"
  /\ stale' = IF CleanBeforeBuild THEN FALSE ELSE stale
  /\ UNCHANGED current
Build ==
  /\ phase = "ready"
  /\ phase' \in {"compiled", "failed"}
  /\ current' = (phase' = "compiled")
  /\ UNCHANGED stale
Pack ==
  /\ phase = "compiled" /\ current
  /\ phase' = "packed"
  /\ UNCHANGED <<stale, current>>
Next == Prepare \/ Build \/ Pack \/ UNCHANGED vars
FreshEntrypoint == phase = "packed" => current /\ ~stale
=============================================================================
