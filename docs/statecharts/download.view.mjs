export const title = "FilePizza download, pause, and resume";

const labels = {
  ready: "Recipient opens the download",
  reading: "Reading the next piece",
  between: "Piece received",
  paused: "Download paused",
  final: "Final piece received",
  closed: "Connection closed",
  failed: "Download failed",
};

export const state = ({ peer }) => labels[peer.recipient.phase];

export function step(action, from, to) {
  switch (action) {
    case "StartTransfer":
      return {
        ready: "recipient starts downloading",
        paused: "recipient resumes",
        final: "recipient starts again",
      }[from.peer.recipient.phase] ?? "recipient restarts";
    case "PauseTransfer": return "recipient pauses";
    case "RunTimer": return "next piece is due";
    case "ReadCompletes": return "the piece arrives";
    case "FinishDownload":
    case "PeerDisconnected": return "the connection closes";
    case "EndPeer":
      return to.peer.recipient.phase === "failed" ? "the transfer fails" : "the connection closes";
    case "TransferFailed": return "the transfer fails";
    case "DiscardRead": return "an old read is discarded";
    case "Closed": return "the connection stays closed";
    default: throw new Error(`Unexpected action ${action}`);
  }
}
