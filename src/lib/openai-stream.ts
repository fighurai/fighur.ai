/**
 * Convert an OpenAI-compatible streaming chat completion response into raw text chunks.
 * Tracks `finish_reason` so callers can auto-continue when the output token budget is hit.
 */

export type OpenAIStreamMeta = {
  finishReason: string | null;
};

/**
 * Pipe an OpenAI SSE body into a controller. Returns finish_reason (`stop` | `length` | …).
 * Does **not** close the controller — callers may continue another round.
 */
export async function pipeOpenAIStream(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  onText?: (chunk: string) => void,
): Promise<OpenAIStreamMeta> {
  const body = response.body;
  if (!body) {
    throw new Error("No response body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string | null };
          finish_reason?: string | null;
        }>;
      };
      const choice = json.choices?.[0];
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        onText?.(delta);
        controller.enqueue(encoder.encode(delta));
      }
    } catch {
      /* ignore malformed SSE chunks */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    if (done) {
      for (const line of buffer.split("\n")) handleLine(line);
      break;
    }
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }

  return { finishReason };
}

/**
 * Convert an OpenAI-compatible streaming chat completion response into raw text chunks.
 */
export function openAIStreamToTextStream(response: Response): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        await pipeOpenAIStream(response, controller, encoder);
      } finally {
        controller.close();
      }
    },
  });
}
