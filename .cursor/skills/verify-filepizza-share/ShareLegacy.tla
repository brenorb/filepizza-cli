------------------------------ MODULE ShareLegacy ------------------------------

VARIABLE state

Init ==
    state = [worker |-> "not launched", disk |-> "missing", urls |-> FALSE,
             share |-> "validating", printed |-> "none", stop |-> "idle"]

Alive == state.worker \notin {"not launched", "exited"}
Status == IF state.disk = "seeding" /\ ~Alive THEN "stopped" ELSE state.disk

SpawnWorker ==
    /\ state.share = "validating"
    /\ state' = [state EXCEPT !.worker = "booting", !.share = "waiting"]

InvalidInput ==
    /\ state.share = "validating"
    /\ state' = [state EXCEPT !.share = "failed"]

RecordStarting ==
    /\ state.worker = "booting"
    /\ state' = [state EXCEPT !.worker = "starting", !.disk = "starting"]

PublishLink ==
    /\ state.worker = "starting"
    /\ state' = [state EXCEPT !.worker = "registering handlers", !.disk = "seeding", !.urls = TRUE]

InstallSignalHandlers ==
    /\ state.worker = "registering handlers"
    /\ state' = [state EXCEPT !.worker = "running"]

RecordStartupFailure ==
    /\ state.worker = "starting"
    /\ state' = [state EXCEPT !.worker = "exited", !.disk = "error"]

WorkerExits ==
    /\ Alive
    /\ state' = [state EXCEPT !.worker = "exited"]

ShareReadsUrls ==
    /\ state.share = "waiting" /\ state.urls /\ Status # "error"
    /\ state' = [state EXCEPT !.share = "printed", !.printed = Status]

ShareReadsError ==
    /\ state.share = "waiting" /\ Status = "error"
    /\ state' = [state EXCEPT !.share = "failed"]

ShareTimesOut ==
    /\ state.share = "waiting"
    /\ state' = [state EXCEPT !.share = "timed out"]

StopReadsManifest ==
    /\ state.stop = "idle"
    /\ state' = [state EXCEPT !.stop = IF state.disk = "missing" THEN "unknown" ELSE "signaling"]

SignalWorker ==
    /\ state.stop = "signaling"
    /\ state' = [state EXCEPT !.stop = "waiting",
                   !.worker = CASE @ = "running" -> "stopping"
                                 [] @ = "stopping" -> @
                                 [] OTHER -> "exited"]

WriteStopped ==
    /\ state.worker = "stopping"
    /\ state' = [state EXCEPT !.worker = "exited", !.disk = "stopped"]

ReadStopped ==
    /\ state.stop = "waiting" /\ Status \in {"stopped", "error"}
    /\ state' = [state EXCEPT !.stop = Status]

StopTimesOut ==
    /\ state.stop = "waiting"
    /\ state' = [state EXCEPT !.stop = "timed out"]

Done ==
    /\ ~Alive
    /\ state.share \notin {"validating", "waiting"}
    /\ state.stop \notin {"idle", "signaling", "waiting"}
    /\ UNCHANGED state

Next == SpawnWorker \/ InvalidInput \/ RecordStarting \/ PublishLink \/ InstallSignalHandlers
        \/ RecordStartupFailure \/ WorkerExits \/ ShareReadsUrls \/ ShareReadsError \/ ShareTimesOut
        \/ StopReadsManifest \/ SignalWorker \/ WriteStopped \/ ReadStopped \/ StopTimesOut \/ Done

PrintedShareWasSeeding == state.share = "printed" => state.printed = "seeding"

=============================================================================
