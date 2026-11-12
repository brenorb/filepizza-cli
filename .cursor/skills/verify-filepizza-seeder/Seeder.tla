-------------------------------- MODULE Seeder --------------------------------

VARIABLE state

Init ==
    state = [startup |-> "file", disk |-> "starting", peer |-> "absent",
             cleanup |-> "idle", finishAs |-> "none", recordedTerminal |-> FALSE,
             warning |-> FALSE, renewal |-> "idle"]

Preparing == state.startup \in {"file", "ice", "peer", "channel"}

FileOpened ==
    /\ state.startup = "file"
    /\ state' = [state EXCEPT !.startup = "ice"]

IceFetched ==
    /\ state.startup = "ice"
    /\ state' = [state EXCEPT !.startup = "peer"]

PeerOpened ==
    /\ state.startup = "peer"
    /\ state' = [state EXCEPT !.startup = "channel", !.peer = "open"]

WriteSeedingBegins ==
    /\ state.startup = "channel"
    /\ state' = [state EXCEPT !.startup = "saving"]

WriteSeedingCommits ==
    /\ state.startup = "saving"
    /\ state' = [state EXCEPT !.startup = "returned", !.disk = "seeding"]

BeginCleanup(result) ==
    /\ state.cleanup = "idle"
    /\ state' = [state EXCEPT
                    !.startup = IF Preparing THEN "rejected" ELSE @,
                    !.peer = IF @ = "open" THEN "closed" ELSE @,
                    !.cleanup = "settling",
                    !.finishAs = result,
                    !.renewal = "idle"]

PeerError ==
    /\ state.startup \in {"channel", "saving", "returned"}
    /\ state.peer = "open"
    /\ BeginCleanup("error")

StartupFails ==
    /\ Preparing
    /\ BeginCleanup("error")

CancelStartup ==
    /\ Preparing
    /\ BeginCleanup("stopped")

StopUpload ==
    /\ state.startup = "returned"
    /\ BeginCleanup("stopped")

RenewalStarts ==
    /\ state.startup = "returned" /\ state.cleanup = "idle" /\ state.renewal = "idle"
    /\ state' = [state EXCEPT !.renewal = "pending"]

RenewalSucceeds ==
    /\ state.renewal = "pending"
    /\ state' = [state EXCEPT !.renewal = "idle"]

RenewalFails ==
    /\ state.renewal = "pending"
    /\ BeginCleanup("error")

CleanupSettles ==
    /\ state.cleanup = "settling"
    /\ \E warning \in BOOLEAN:
        state' = [state EXCEPT !.cleanup = "recording", !.warning = warning]

WriteTerminalCommits ==
    /\ state.cleanup = "recording"
    /\ state' = [state EXCEPT !.cleanup = "done", !.disk = state.finishAs,
                             !.recordedTerminal = TRUE]

Done ==
    /\ state.cleanup = "done" /\ state.startup # "saving"
    /\ UNCHANGED state

Next == FileOpened \/ IceFetched \/ PeerOpened \/ WriteSeedingBegins \/ WriteSeedingCommits
        \/ PeerError \/ StartupFails \/ CancelStartup \/ StopUpload
        \/ RenewalStarts \/ RenewalSucceeds \/ RenewalFails
        \/ CleanupSettles \/ WriteTerminalCommits \/ Done

TerminalRecordStaysTerminal ==
    state.recordedTerminal => state.disk \in {"stopped", "error"}

=============================================================================
