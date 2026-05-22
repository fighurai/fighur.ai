/** Count streamed plain-text bytes and run callback when the stream closes. */
export function trackPlainTextStream(
  source: ReadableStream<Uint8Array>,
  onComplete: (outputChars: number) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let outputChars = 0;

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        outputChars += decoder.decode(chunk, { stream: true }).length;
        controller.enqueue(chunk);
      },
      flush() {
        outputChars += decoder.decode().length;
        onComplete(outputChars);
      },
    }),
  );
}
