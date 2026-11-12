export const title = "FilePizza share, status, and stop";

export function state({ state: share }) {
  if (share.share === "validating") return "Checking the local file";
  if (share.disk === "error") return "Share failed";
  if (share.disk === "stopped") return "Share stopped";
  if (share.worker === "exited") {
    return share.disk === "missing" ? "Share failed" : "Share stopped";
  }
  if (share.share === "failed") return "Share failed";
  if (share.stop === "waiting" || share.marker || share.worker === "draining" ||
      share.share === "interrupting") return "Stopping the share";
  if (share.worker === "running" && ["link printed", "timed out"].includes(share.share)) {
    return "Link available";
  }
  if (share.share === "timed out") return "Share command timed out";
  return "Waiting for a link";
}

export function step(action, from, to) {
  switch (action) {
    case "SpawnWorker": return "the file is accepted";
    case "InvalidFile": return "the file is rejected";
    case "RecordStarting": return "the background worker starts";
    case "WorkerReady": return "the link becomes available";
    case "LinkPrinted": return "the command prints the link";
    case "SeederFails": return "the share fails";
    case "WorkerExits": return "the background worker exits";
    case "ShareReadsFailure": return "the command reads the failure";
    case "ShareTimesOut": return to.state.worker === "running"
      ? "the share deadline passes [status can show the link]"
      : "the share deadline passes";
    case "InterruptShare": return "the sender interrupts the command";
    case "InterruptedMarkerWritten":
    case "StopMarkerWritten": return "the sender requests a stop";
    case "StopReadsRecord": return "the stop command reads the upload status";
    case "WorkerReadsStopMarker": return "the worker sees the stop request";
    case "WorkerFinishesStop": return "the background worker stops";
    case "WorkerClearsMarker": return "the background worker exits";
    case "StopReadsTerminal": return "the stop command confirms the outcome";
    case "StopTimesOut": return "the stop deadline passes";
    case "Done": return "the share stays closed";
    default: throw new Error(`Unexpected action ${action}`);
  }
}
