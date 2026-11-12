------------------------------ MODULE PeerReady ------------------------------

CONSTANT Mode
VARIABLE wait

Init ==
    \E hasId, preAborted \in BOOLEAN:
        wait = [phase |-> "entering", hasId |-> hasId, preAborted |-> preAborted,
                watches |-> {}]

CheckInitialState ==
    /\ wait.phase = "entering"
    /\ IF Mode # "legacy" /\ wait.preAborted
       THEN wait' = [wait EXCEPT !.phase = "cancelled"]
       ELSE IF wait.hasId
       THEN wait' = [wait EXCEPT !.phase = "open"]
       ELSE wait' = [wait EXCEPT !.phase = "waiting",
                           !.watches = IF Mode = "legacy" THEN {"open", "error"}
                                       ELSE {"open", "error", "abort", "timer"}]

AfterSettlement(event) ==
    CASE Mode = "current" -> {}
      [] Mode = "keep open listener" -> {"open"}
      [] OTHER -> {event}

PeerOpens ==
    /\ wait.phase = "waiting"
    /\ wait' = [wait EXCEPT !.phase = "open", !.watches = AfterSettlement("open")]

PeerErrors ==
    /\ wait.phase = "waiting"
    /\ wait' = [wait EXCEPT !.phase = "error", !.watches = AfterSettlement("error")]

TimerExpires ==
    /\ wait.phase = "waiting" /\ Mode # "legacy"
    /\ wait' = [wait EXCEPT !.phase = "timeout", !.watches = AfterSettlement("error")]

SignalCancels ==
    /\ wait.phase = "waiting" /\ Mode # "legacy"
    /\ wait' = [wait EXCEPT !.phase = "cancelled", !.watches = AfterSettlement("error")]

Done ==
    /\ wait.phase \in {"open", "error", "timeout", "cancelled"}
    /\ UNCHANGED wait

Next == CheckInitialState \/ PeerOpens \/ PeerErrors \/ TimerExpires \/ SignalCancels \/ Done

SettledWaitRemovesWatchers ==
    wait.phase \in {"open", "error", "timeout", "cancelled"} => wait.watches = {}

=============================================================================
