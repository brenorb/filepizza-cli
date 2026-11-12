------------------------------ MODULE Cancellation ------------------------------

CONSTANT DisposeLateValue
VARIABLE run

Init ==
    \E kind \in {"resource", "delay"}, preAborted \in BOOLEAN:
        run = [kind |-> kind, result |-> IF preAborted THEN "cancelled" ELSE "pending",
               work |-> IF kind = "delay" /\ preAborted THEN "cleared" ELSE "pending"]

Cancel ==
    /\ run.result = "pending"
    /\ run' = [run EXCEPT !.result = "cancelled",
                          !.work = IF run.kind = "delay" THEN "cleared" ELSE @]

ResourceArrives ==
    /\ run.kind = "resource" /\ run.work = "pending"
    /\ run' = [run EXCEPT
                 !.work = IF run.result = "pending" THEN "handed off"
                          ELSE IF DisposeLateValue THEN "cleanup queued" ELSE "leaked",
                 !.result = IF @ = "pending" THEN "fulfilled" ELSE @]

ResourceFails ==
    /\ run.kind = "resource" /\ run.work = "pending"
    /\ run' = [run EXCEPT !.work = "failed",
                          !.result = IF @ = "pending" THEN "failed" ELSE @]

AttemptCleanup ==
    /\ run.work = "cleanup queued"
    /\ run' = [run EXCEPT !.work = "cleanup attempted"]

TimerExpires ==
    /\ run.kind = "delay" /\ run.work = "pending"
    /\ run' = [run EXCEPT !.work = "elapsed", !.result = "fulfilled"]

Done ==
    /\ run.work \notin {"pending", "cleanup queued"}
    /\ UNCHANGED run

Next == Cancel \/ ResourceArrives \/ ResourceFails \/ AttemptCleanup \/ TimerExpires \/ Done

LateValuesGetCleanup == run.work # "leaked"

=============================================================================
