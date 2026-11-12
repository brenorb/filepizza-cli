-------------------------------- MODULE Manifest --------------------------------

CONSTANTS Writers, AtomicReplace, HasStopMarker
VARIABLES disk, writer, snapshot, marker

vars == <<disk, writer, snapshot, marker>>

Init ==
    /\ disk \in {"missing", "previous"}
    /\ writer = [w \in Writers |-> "idle"]
    /\ snapshot = "unread"
    /\ marker = "idle"

WriteBegins ==
    \E w \in Writers:
        /\ writer[w] = "idle"
        /\ writer' = [writer EXCEPT ![w] = "writing"]
        /\ disk' = IF AtomicReplace THEN disk ELSE "partial"
        /\ UNCHANGED <<snapshot, marker>>

WriteFinishes ==
    \E w \in Writers:
        /\ writer[w] = "writing"
        /\ writer' = [writer EXCEPT ![w] = IF AtomicReplace THEN "staged" ELSE "committed"]
        /\ disk' = IF AtomicReplace THEN disk ELSE "current"
        /\ UNCHANGED <<snapshot, marker>>

RenameCommits ==
    \E w \in Writers:
        /\ writer[w] = "staged"
        /\ writer' = [writer EXCEPT ![w] = "committed"]
        /\ disk' = "current"
        /\ UNCHANGED <<snapshot, marker>>

WriteFails ==
    \E w \in Writers:
        /\ writer[w] \in {"writing", "staged"}
        /\ writer' = [writer EXCEPT ![w] = "failed"]
        /\ UNCHANGED <<disk, snapshot, marker>>

ReadSnapshot ==
    /\ snapshot = "unread"
    /\ snapshot' = disk
    /\ UNCHANGED <<disk, writer, marker>>

StageStopMarker ==
    /\ HasStopMarker /\ marker = "idle"
    /\ marker' = "staged"
    /\ UNCHANGED <<disk, writer, snapshot>>

PublishStopMarker ==
    /\ marker = "staged"
    /\ marker' = "visible"
    /\ UNCHANGED <<disk, writer, snapshot>>

StopMarkerWriteFails ==
    /\ marker = "staged"
    /\ marker' = "failed"
    /\ UNCHANGED <<disk, writer, snapshot>>

ClearStopMarker ==
    /\ marker = "visible"
    /\ marker' = "cleared"
    /\ UNCHANGED <<disk, writer, snapshot>>

Done ==
    /\ \A w \in Writers: writer[w] \in {"committed", "failed"}
    /\ snapshot # "unread"
    /\ marker \in {"idle", "failed", "cleared"}
    /\ UNCHANGED vars

Next == WriteBegins \/ WriteFinishes \/ RenameCommits \/ WriteFails \/ ReadSnapshot
        \/ StageStopMarker \/ PublishStopMarker \/ StopMarkerWriteFails \/ ClearStopMarker \/ Done

WholeManifestSnapshots == snapshot # "partial"

=============================================================================
