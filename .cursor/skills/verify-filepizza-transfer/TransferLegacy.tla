---------------------------- MODULE TransferLegacy ----------------------------
EXTENDS Integers

CONSTANTS Peers, MaxStarts
VARIABLES peer, reads, timers, tracked, staleSend, cancelledOther

vars == <<peer, reads, timers, tracked, staleSend, cancelledOther>>
Work(recipient, epoch, chunk) == [recipient |-> recipient, epoch |-> epoch, chunk |-> chunk]
NoTimer == Work(CHOOSE p \in Peers: TRUE, 0, 0)

Init ==
    /\ peer = [p \in Peers |-> [open |-> TRUE, active |-> FALSE, epoch |-> 0]]
    /\ reads = {} /\ timers = {} /\ tracked = NoTimer
    /\ staleSend = FALSE /\ cancelledOther = FALSE

ClearTrackedTimer(recipient) ==
    /\ cancelledOther' = (cancelledOther \/
        (IF tracked \in timers THEN tracked.recipient # recipient ELSE FALSE))
    /\ timers' = timers \ {tracked}
    /\ tracked' = NoTimer

StartTransfer ==
    \E p \in Peers, chunk \in 1..2:
        /\ peer[p].open /\ peer[p].epoch < MaxStarts
        /\ LET epoch == peer[p].epoch + 1 IN
            /\ peer' = [peer EXCEPT ![p].epoch = epoch, ![p].active = TRUE]
            /\ reads' = reads \cup {Work(p, epoch, chunk)}
        /\ ClearTrackedTimer(p)
        /\ UNCHANGED staleSend

PauseTransfer ==
    \E p \in Peers:
        /\ peer[p].open
        /\ peer' = [peer EXCEPT ![p].active = FALSE]
        /\ ClearTrackedTimer(p)
        /\ UNCHANGED <<reads, staleSend>>

CloseConnection ==
    \E p \in Peers:
        /\ peer[p].open
        /\ peer' = [peer EXCEPT ![p].open = FALSE, ![p].active = FALSE]
        /\ ClearTrackedTimer(p)
        /\ UNCHANGED <<reads, staleSend>>

RunTimer ==
    \E timer \in timers:
        /\ timers' = timers \ {timer}
        /\ reads' = reads \cup {timer}
        /\ UNCHANGED <<peer, tracked, staleSend, cancelledOther>>

ReadCompletes ==
    \E read \in reads:
        LET current == peer[read.recipient] IN
        /\ staleSend' = (staleSend \/ ~current.open \/ ~current.active \/ current.epoch # read.epoch)
        /\ reads' = reads \ {read}
        /\ IF read.chunk = 1
            THEN /\ tracked' = Work(read.recipient, read.epoch, 2)
                 /\ timers' = timers \cup {tracked'}
            ELSE /\ tracked' = NoTimer
                 /\ UNCHANGED timers
        /\ UNCHANGED <<peer, cancelledOther>>

Closed ==
    /\ \A p \in Peers: ~peer[p].open
    /\ reads = {} /\ timers = {}
    /\ UNCHANGED vars

Next == StartTransfer \/ PauseTransfer \/ CloseConnection \/ RunTimer \/ ReadCompletes \/ Closed

OnlyCurrentReadsSend == ~staleSend
RecipientTimersAreIndependent == ~cancelledOther

=============================================================================
