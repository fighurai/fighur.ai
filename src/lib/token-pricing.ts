/** Rough USD cost per 1M tokens (blended input+output estimate for budgeting). */
const MODEL_USD_PER_1M: Record<string, number> = {
  "anthropic:claude-sonnet-4-5-20250929": 3.5,
  "openai:gpt-4o-mini": 0.35,
  "openai:gpt-4o": 6,
  "groq:llama-3.3-70b-versatile": 0.59,
  "groq:openai/gpt-oss-120b": 0.75,
  "groq:mixtral-8x7b-32768": 0.24,
  default: 1.2,
};

/** ~4 characters per token for English prose. */
export function charsToEstimatedTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function estimateUsageCostUsd(
  modelId: string,
  inputChars: number,
  outputChars: number,
): number {
  const rate = MODEL_USD_PER_1M[modelId] ?? MODEL_USD_PER_1M.default;
  const tokens = charsToEstimatedTokens(inputChars + outputChars);
  return (tokens / 1_000_000) * rate;
}
