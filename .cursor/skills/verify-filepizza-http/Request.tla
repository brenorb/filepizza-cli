-------------------------------- MODULE Request --------------------------------

CONSTANTS HasCancellation, DeadlineWinsRace
VARIABLES phase, deadlineFired, aborted

vars == <<phase, deadlineFired, aborted>>

Init ==
    /\ phase = "headers"
    /\ deadlineFired = FALSE /\ aborted = FALSE

HeadersReceived ==
    /\ phase = "headers"
    /\ phase' = "body"
    /\ UNCHANGED <<deadlineFired, aborted>>

BodyParsed ==
    /\ phase = "body"
    /\ phase' = "success"
    /\ aborted' = HasCancellation
    /\ UNCHANGED deadlineFired

RequestFails ==
    /\ phase \in {"headers", "body"}
    /\ phase' = "failed"
    /\ aborted' = HasCancellation
    /\ UNCHANGED deadlineFired

DeadlineReached ==
    /\ phase \in {"headers", "body"} /\ ~deadlineFired
    /\ deadlineFired' = TRUE
    /\ phase' = IF HasCancellation /\ DeadlineWinsRace THEN "timeout" ELSE phase
    /\ aborted' = HasCancellation

CallerCancels ==
    /\ HasCancellation /\ phase \in {"headers", "body"}
    /\ phase' = "cancelled" /\ aborted' = TRUE
    /\ UNCHANGED deadlineFired

Done ==
    /\ phase \in {"success", "failed", "timeout", "cancelled"}
    /\ UNCHANGED vars

Next == HeadersReceived \/ BodyParsed \/ RequestFails \/ DeadlineReached \/ CallerCancels \/ Done

DeadlineEndsCallerWait == deadlineFired => phase = "timeout"

=============================================================================
