export const title = "FilePizza link availability and seeder shutdown";

export function state({ state: upload }) {
  if (upload.recordedTerminal && upload.disk === "seeding") return "Stopped link reported as available";
  if (upload.disk === "stopped") return "Share stopped";
  if (upload.disk === "error") return "Share failure recorded";
  if (upload.cleanup !== "idle") return "Share unavailable, cleanup in progress";
  if (upload.disk === "seeding") return "Link available";
  if (upload.startup === "saving") return "Link created, waiting for it to be saved";
  return "Starting the share";
}

export function step(action, from, to) {
  switch (action) {
    case "FileOpened": return "the file opens";
    case "IceFetched": return "the connection settings arrive";
    case "PeerOpened": return "the connection opens";
    case "WriteSeedingBegins": return "the service creates the link";
    case "WriteSeedingCommits": return "the link is saved";
    case "PeerError":
    case "StartupFails":
    case "RenewalFails":
    case "CancelStartup":
    case "StopUpload":
    case "BeginCleanup":
      return to.state.finishAs === "stopped" ? "the sender stops the share" : "the share fails";
    case "RenewalStarts": return "the link is due for renewal";
    case "RenewalSucceeds": return "the service renews the link";
    case "CleanupSettles": return "cleanup finishes or reaches its deadline";
    case "WriteTerminalCommits":
      return to.state.disk === "error" ? "the failure is saved" : "the stopped status is saved";
    case "Done": return "the share stays unavailable";
    default: throw new Error(`Unexpected action ${action}`);
  }
}
