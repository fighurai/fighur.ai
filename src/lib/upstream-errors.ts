/** Map provider HTTP errors to short user-facing text (never dump raw JSON into chat). */
export function formatFriendlyUpstreamError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (
    status === 429 ||
    lower.includes("insufficient_quota") ||
    lower.includes("credit_balance_exhausted") ||
    lower.includes("exceeded your current quota")
  ) {
    return "The image/chat provider is out of credits (OpenAI quota). FIGHURAI will keep working with other models and tools when available — add billing at platform.openai.com, or use Claude / Auto without OpenAI image gen.";
  }
  if (status === 401 || status === 403) {
    return "The AI provider rejected the API key. Check server environment variables.";
  }
  if (status >= 500) {
    return `The AI provider is temporarily unavailable (${status}). Try again in a moment.`;
  }
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return snippet
    ? `The AI provider returned an error (${status}): ${snippet}`
    : `The AI provider returned an error (${status}).`;
}
