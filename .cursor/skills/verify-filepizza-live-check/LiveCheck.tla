------------------------------- MODULE LiveCheck -------------------------------

CONSTANT VerifyBytes
VARIABLE run

Init ==
    run = [phase |-> "share", knownId |-> FALSE, result |-> "pending",
           exactBytes |-> FALSE, successPrinted |-> FALSE]

ShareStarts ==
    /\ run.phase = "share"
    /\ run' = [run EXCEPT !.phase = "connect", !.knownId = TRUE]

ShareFails ==
    /\ run.phase = "share"
    /\ run' = [run EXCEPT !.phase = "close recipient", !.result = "error"]

RecipientConnects ==
    /\ run.phase = "connect"
    /\ run' = [run EXCEPT !.phase = "receiving"]

TransferFails ==
    /\ run.phase \in {"connect", "receiving"}
    /\ run' = [run EXCEPT !.phase = "close recipient", !.result = "error"]

FinalPieceArrives ==
    /\ run.phase = "receiving"
    /\ \E exact \in BOOLEAN:
        run' = [run EXCEPT !.phase = "validate", !.exactBytes = exact]

CheckTransfer ==
    /\ run.phase = "validate"
    /\ \E multiplePieces \in BOOLEAN:
        LET success == multiplePieces /\ (~VerifyBytes \/ run.exactBytes) IN
        run' = [run EXCEPT !.phase = "close recipient", !.successPrinted = success,
                           !.result = IF success THEN "success" ELSE "error"]

CloseRecipient ==
    /\ run.phase = "close recipient"
    /\ \E closed \in BOOLEAN:
        run' = [run EXCEPT !.phase = IF run.knownId THEN "stop" ELSE "discover",
                           !.result = IF closed THEN @ ELSE "error"]

RecoverUploadId ==
    /\ run.phase = "discover"
    /\ \E found \in BOOLEAN:
        run' = [run EXCEPT !.knownId = found,
                           !.phase = IF found THEN "stop" ELSE "remove scratch"]

RequestWorkerStop ==
    /\ run.phase = "stop"
    /\ run' = [run EXCEPT !.phase = "wait for exit"]

WorkerExited ==
    /\ run.phase = "wait for exit"
    /\ run' = [run EXCEPT !.phase = "remove scratch"]

ScratchRemoved ==
    /\ run.phase = "remove scratch"
    /\ run' = [run EXCEPT !.phase = "done"]

CleanupFails ==
    /\ run.phase \in {"discover", "stop", "wait for exit", "remove scratch"}
    /\ run' = [run EXCEPT !.phase = "done", !.result = "error"]

Done ==
    /\ run.phase = "done"
    /\ UNCHANGED run

Next == ShareStarts \/ ShareFails \/ RecipientConnects \/ TransferFails \/ FinalPieceArrives
        \/ CheckTransfer \/ CloseRecipient \/ RecoverUploadId \/ RequestWorkerStop
        \/ WorkerExited \/ ScratchRemoved \/ CleanupFails \/ Done

SuccessReportsAnExactTransfer == run.successPrinted => run.exactBytes

=============================================================================
