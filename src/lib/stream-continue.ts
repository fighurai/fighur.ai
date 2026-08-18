/** Max silent continuations when the model hits the output token ceiling. */
export const MAX_OUTPUT_CONTINUES = 3;

export const CONTINUE_OUTPUT_PROMPT =
  "Continue exactly where you left off. Do not repeat prior text. Do not say you are done until the full deliverable is finished (every section, script, and closing fence if you opened one).";

export function isOutputTruncated(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return r === "length" || r === "max_tokens" || r === "max_tokens_exceeded";
}
