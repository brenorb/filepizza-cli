----------------------------- MODULE SeederLegacy -----------------------------
EXTENDS Naturals

VARIABLE state

Init ==
    state = [phase |-> "file", peerOpen |-> FALSE, renewals |-> 0,
             terminal |-> "none", remoteBudgetExpired |-> FALSE]

Preparing == state.phase \in {"file", "ice", "peer", "channel", "recording"}

FileOpened ==
    /\ state.phase = "file"
    /\ state' = [state EXCEPT !.phase = "ice"]

IceFetched ==
    /\ state.phase = "ice"
    /\ state' = [state EXCEPT !.phase = "peer"]

PeerOpened ==
    /\ state.phase = "peer"
    /\ state' = [state EXCEPT !.phase = "channel", !.peerOpen = TRUE]

ChannelCreated ==
    /\ state.phase = "channel"
    /\ state' = [state EXCEPT !.phase = "recording"]

ReadyRecordWritten ==
    /\ state.phase = "recording"
    /\ state' = [state EXCEPT !.phase = "live"]

RenewalBegins ==
    /\ state.phase \in {"recording", "live"} /\ state.renewals < 2
    /\ state' = [state EXCEPT !.renewals = @ + 1]

RenewalSettles ==
    /\ state.renewals > 0
    /\ state' = [state EXCEPT !.renewals = @ - 1]

StartFails ==
    /\ Preparing
    /\ state' = [state EXCEPT !.phase = "cleaning startup", !.peerOpen = FALSE]

RecordStartupError ==
    /\ state.phase = "cleaning startup"
    /\ state' = [state EXCEPT !.phase = "done", !.terminal = "error"]

StopRequested ==
    /\ state.phase = "live"
    /\ state' = [state EXCEPT !.phase = "remote teardown"]

RemoteDestroyBudgetExpires ==
    /\ state.phase = "remote teardown" /\ ~state.remoteBudgetExpired
    /\ state' = [state EXCEPT !.remoteBudgetExpired = TRUE]

RemoteDestroySettles ==
    /\ state.phase = "remote teardown"
    /\ state' = [state EXCEPT !.phase = "local teardown", !.peerOpen = FALSE]

RecordStopped ==
    /\ state.phase = "local teardown"
    /\ state' = [state EXCEPT !.phase = "done", !.terminal = "stopped"]

Done ==
    /\ state.phase = "done"
    /\ UNCHANGED state

Next == FileOpened \/ IceFetched \/ PeerOpened \/ ChannelCreated \/ ReadyRecordWritten
        \/ RenewalBegins \/ RenewalSettles \/ StartFails \/ RecordStartupError
        \/ StopRequested \/ RemoteDestroyBudgetExpires \/ RemoteDestroySettles \/ RecordStopped \/ Done

LocalPeerStopsWithinCleanupBudget == state.remoteBudgetExpired => ~state.peerOpen

=============================================================================
