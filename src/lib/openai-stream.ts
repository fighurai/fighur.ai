/**
 * Convert an OpenAI-compatible streaming chat completion response into raw text chunks.
 */
export function openAIStreamToTextStream(response: Response): ReadableStream<Uint8Array> {
  const body = response.body;
  if (!body) {
    throw new Error("No response body");
  }

  const reader = body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function enqueueFromLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string | null } }>;
      };
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        controller.enqueue(encoder.encode(delta));
      }
    } catch {
      /* ignore malformed SSE chunks */
    }
  }

  return new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          if (done) {
            for (const line of buffer.split("\n")) {
              enqueueFromLine(line, controller);
            }
            break;
          }
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            enqueueFromLine(line, controller);
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
