------------------------------- MODULE Transfer -------------------------------
EXTENDS Integers

CONSTANTS Peers, MaxStarts, LastChunk, CheckAfterRead
VARIABLES peer, sent

vars == <<peer, sent>>
Read(epoch, chunk) == [epoch |-> epoch, chunk |-> chunk]

Init ==
    /\ peer = [p \in Peers |-> [open |-> TRUE, active |-> FALSE,
                               epoch |-> 0, reads |-> {}, timer |-> 0,
                               phase |-> "ready"]]
    /\ sent = [valid |-> TRUE, chunk |-> 0]

StartTransfer ==
    \E p \in Peers, chunk \in 1..LastChunk:
        /\ peer[p].open /\ peer[p].epoch < MaxStarts
        /\ LET epoch == peer[p].epoch + 1 IN
            peer' = [peer EXCEPT ![p].active = TRUE, ![p].epoch = epoch,
                        ![p].reads = @ \cup {Read(epoch, chunk)},
                        ![p].timer = 0, ![p].phase = "reading"]
        /\ UNCHANGED sent

PauseTransfer ==
    \E p \in Peers:
        /\ peer[p].open /\ peer[p].active
        /\ peer' = [peer EXCEPT ![p].active = FALSE, ![p].timer = 0,
                                ![p].phase = "paused"]
        /\ UNCHANGED sent

RunTimer ==
    \E p \in Peers:
        /\ peer[p].timer # 0
        /\ peer' = [peer EXCEPT
                    ![p].reads = @ \cup {Read(peer[p].epoch, peer[p].timer)},
                    ![p].timer = 0, ![p].phase = "reading"]
        /\ UNCHANGED sent

IsCurrent(p, read) ==
    peer[p].open /\ peer[p].active /\ peer[p].epoch = read.epoch

ReadCompletes ==
    \E p \in Peers: \E read \in peer[p].reads:
        /\ (CheckAfterRead => IsCurrent(p, read))
        /\ peer' = [peer EXCEPT
                    ![p].reads = @ \ {read},
                    ![p].timer = IF read.chunk = LastChunk THEN 0 ELSE read.chunk + 1,
                    ![p].phase = IF read.chunk = LastChunk THEN "final" ELSE "between"]
        /\ sent' = [valid |-> IsCurrent(p, read), chunk |-> read.chunk]

DiscardRead ==
    \E p \in Peers: \E read \in peer[p].reads:
        /\ ~IsCurrent(p, read)
        /\ peer' = [peer EXCEPT ![p].reads = @ \ {read}]
        /\ UNCHANGED sent

EndPeer(p, phase) ==
    /\ peer[p].open
    /\ peer' = [peer EXCEPT ![p].open = FALSE, ![p].active = FALSE,
                            ![p].timer = 0, ![p].phase = phase]
    /\ UNCHANGED sent

FinishDownload == \E p \in Peers: EndPeer(p, "closed")
PeerDisconnected == \E p \in Peers: EndPeer(p, "closed")
TransferFailed == \E p \in Peers: EndPeer(p, "failed")

Closed ==
    /\ \A p \in Peers: ~peer[p].open /\ peer[p].reads = {} /\ peer[p].timer = 0
    /\ UNCHANGED vars

Next == StartTransfer \/ PauseTransfer \/ RunTimer \/ ReadCompletes \/ DiscardRead
        \/ FinishDownload \/ PeerDisconnected \/ TransferFailed \/ Closed

OnlyCurrentReadsSend == sent.valid

=============================================================================
