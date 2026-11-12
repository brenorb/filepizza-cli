--------------------------------- MODULE Share ---------------------------------

CONSTANTS IncludeLegacy, CheckControlVersion
VARIABLE state

NewShare ==
    [worker |-> "not launched", disk |-> "missing", hasControl |-> TRUE,
     share |-> "validating", stop |-> "idle", marker |-> FALSE, legacyMarker |-> FALSE]

Init ==
    \/ state = NewShare
    \/ IncludeLegacy /\ state = [NewShare EXCEPT !.worker = "running", !.disk = "seeding",
                               !.hasControl = FALSE, !.share = "link printed"]

Status ==
    IF state.disk \in {"starting", "seeding"} /\ state.worker = "exited"
    THEN "stopped"
    ELSE state.disk

SpawnWorker ==
    /\ state.share = "validating"
    /\ state' = [state EXCEPT !.worker = "booting", !.share = "waiting"]

InvalidFile ==
    /\ state.share = "validating"
    /\ state' = [state EXCEPT !.share = "failed"]

RecordStarting ==
    /\ state.worker = "booting"
    /\ state' = [state EXCEPT !.worker = "starting", !.disk = "starting"]

WorkerReady ==
    /\ state.worker = "starting"
    /\ state' = [state EXCEPT !.worker = "running", !.disk = "seeding"]

SeederFails ==
    /\ state.worker \in {"starting", "running"}
    /\ state' = [state EXCEPT !.worker = "finished", !.disk = "error"]

WorkerExits ==
    /\ state.worker \in {"booting", "starting", "running", "draining", "finished"}
    /\ state' = [state EXCEPT !.worker = "exited",
                           !.share = IF @ = "waiting" THEN "failed" ELSE @]

LinkPrinted ==
    /\ state.share = "waiting" /\ Status = "seeding"
    /\ state' = [state EXCEPT !.share = "link printed"]

ShareReadsFailure ==
    /\ state.share = "waiting" /\ Status \in {"stopped", "error"}
    /\ state' = [state EXCEPT !.share = "failed"]

ShareTimesOut ==
    /\ state.share = "waiting"
    /\ state' = [state EXCEPT !.share = "timed out"]

InterruptShare ==
    /\ state.share = "waiting"
    /\ state' = [state EXCEPT !.share = "interrupting"]

InterruptedMarkerWritten ==
    /\ state.share = "interrupting"
    /\ state' = [state EXCEPT !.share = "interrupted", !.marker = TRUE]

StopReadsRecord ==
    /\ state.stop = "idle"
    /\ state' = [state EXCEPT !.stop =
        CASE Status = "missing" -> "unknown"
          [] Status \in {"stopped", "error"} -> Status
          [] CheckControlVersion /\ ~state.hasControl -> "refused"
          [] OTHER -> "requesting"]

StopMarkerWritten ==
    /\ state.stop = "requesting"
    /\ state' = [state EXCEPT !.stop = "waiting", !.marker = TRUE,
                           !.legacyMarker = ~state.hasControl]

WorkerReadsStopMarker ==
    /\ state.hasControl /\ state.marker
    /\ state.worker \in {"booting", "starting", "running"}
    /\ state' = [state EXCEPT !.worker = "draining"]

WorkerFinishesStop ==
    /\ state.worker = "draining"
    /\ state' = [state EXCEPT !.worker = "finished", !.disk = "stopped"]

WorkerClearsMarker ==
    /\ state.worker = "finished" /\ state.disk = "stopped" /\ state.marker
    /\ state' = [state EXCEPT !.worker = "exited", !.marker = FALSE]

StopReadsTerminal ==
    /\ state.stop = "waiting" /\ Status \in {"stopped", "error"}
    /\ state' = [state EXCEPT !.stop = Status]

StopTimesOut ==
    /\ state.stop = "waiting"
    /\ state' = [state EXCEPT !.stop = "timed out"]

Done ==
    /\ state.worker \in {"not launched", "exited"}
    /\ state.share \notin {"validating", "waiting", "interrupting"}
    /\ state.stop \notin {"idle", "requesting", "waiting"}
    /\ UNCHANGED state

Next == SpawnWorker \/ InvalidFile \/ RecordStarting \/ WorkerReady \/ SeederFails \/ WorkerExits
        \/ LinkPrinted \/ ShareReadsFailure \/ ShareTimesOut \/ InterruptShare \/ InterruptedMarkerWritten
        \/ StopReadsRecord \/ StopMarkerWritten \/ WorkerReadsStopMarker \/ WorkerFinishesStop
        \/ WorkerClearsMarker \/ StopReadsTerminal \/ StopTimesOut \/ Done

LegacyWorkersRefuseCooperativeStop == ~state.legacyMarker

=============================================================================
