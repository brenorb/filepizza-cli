export const title = "FilePizza 0.1.0 download failure paths";

export function state(v) {
  if (v.staleSend && v.cancelledOther) return "Both downloads are disrupted";
  if (v.staleSend) return "An old download sends a piece";
  if (v.cancelledOther) return "One download loses its next piece";
  if (v.reads.length > 1) return "The first read is still pending after restart";
  if (v.timers.length > 0) return "Waiting to send the next piece";
  if (v.reads.length === 1) return "Reading the first piece";
  return "Recipients have opened the link";
}

export function step(action, from, to) {
  switch (action) {
    case "StartTransfer":
      if (to.cancelledOther && !from.cancelledOther) return "a second recipient starts downloading";
      return from.reads.length > 0 ? "the recipient restarts" : "a recipient starts downloading";
    case "ReadCompletes": return "the piece arrives";
    case "PauseTransfer": return "the recipient pauses";
    case "CloseConnection": return "the connection closes";
    case "RunTimer": return "the next piece is due";
    case "Closed": return "the connection stays closed";
    default: throw new Error(`Unexpected action ${action}`);
  }
}
