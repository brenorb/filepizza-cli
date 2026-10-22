/** Preserve JSON pipelines while making terminal results readable. */
export function outputMode(options: { json?: boolean; plain?: boolean }, isTerminal: boolean): "json" | "plain" {
  if (options.json) return "json";
  if (options.plain) return "plain";
  return isTerminal ? "plain" : "json";
}
