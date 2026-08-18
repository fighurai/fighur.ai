/**
 * Narration / markdown helpers for live chat streaming.
 * Keeps the bubble free of raw `###` / dangling `**` while still letting
 * completed markdown (headings, bold, lists) render as the final reply does.
 */

function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Strip finished + open code fences from the chat bubble (Canvas owns builds). */
export function stripStreamingFences(raw: string): string {
  let text = normalizeNewlines(raw);
  text = text.replace(/```device-ops[\s\S]*?```/gi, "");
  text = text.replace(/```[^\n`]*\r?\n[\s\S]*?```/g, "");

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    const lastOpen = text.lastIndexOf("```");
    if (lastOpen !== -1) text = text.slice(0, lastOpen);
  }
  return text;
}

/**
 * Hold incomplete trailing markers so react-markdown doesn't flash raw tokens.
 * Does NOT strip completed headings/bold — those should render live.
 */
export function holdIncompleteMarkdownTokens(raw: string): string {
  if (!raw) return raw;
  let text = normalizeNewlines(raw);

  // Trailing bare ATX opener with no title yet: "###" or "## "
  text = text.replace(/(?:^|\n)[ \t]*#{1,6}[ \t]*$/g, (m) => (m.startsWith("\n") ? "\n" : ""));

  // Unclosed bold at the very end
  if ((text.match(/\*\*/g) || []).length % 2 === 1) {
    text = text.replace(/\*\*[^*]*$/u, (m) => m.replace(/^\*\*/, ""));
  }

  // Unclosed inline `code`
  if ((text.match(/`/g) || []).length % 2 === 1) {
    text = text.replace(/`[^`]*$/u, "");
  }

  return text;
}

/**
 * Soften markdown for plain-text surfaces: show heading titles without `#`,
 * and hold incomplete trailing markers.
 */
export function softenMarkdownForStream(raw: string): string {
  if (!raw) return raw;
  let text = normalizeNewlines(raw);

  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");
  text = text.replace(/[ \t]+#+[ \t]*$/gm, "");
  text = text.replace(/(?:^|\n)[ \t]*#{1,6}[ \t]*$/g, (m) => (m.startsWith("\n") ? "\n" : ""));

  // Show completed bold without asterisks in plain mode
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");

  if ((text.match(/\*\*/g) || []).length % 2 === 1) {
    text = text.replace(/\*\*[^*]*$/u, (m) => m.replace(/^\*\*/, ""));
  }

  return text;
}

/** @deprecated alias — prefer softenMarkdownForStream / holdIncompleteMarkdownTokens */
export function holdIncompleteMarkdown(raw: string): string {
  return softenMarkdownForStream(raw);
}

/**
 * Plain-text stream narration (legacy). Prefer streamingMarkdownView for UI.
 */
export function streamingNarration(raw: string): string {
  if (!raw) return "";
  let text = stripStreamingFences(raw);
  text = softenMarkdownForStream(text);
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * Markdown string for the live bubble — same visual language as the finalized reply.
 * Avoid auto-closing bold/fences mid-stream (that causes choppy flash); only hold
 * incomplete trailing markers until the next tokens arrive.
 */
export function streamingMarkdownView(raw: string): string {
  if (!raw) return "";
  let text = stripStreamingFences(raw);
  text = holdIncompleteMarkdownTokens(text);
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * Close unfinished markdown blocks so partial streams render cleanly
 * (e.g. unclosed ``` fences won't swallow the rest of the reply).
 */
export function stabilizeStreamingMarkdown(raw: string): string {
  if (!raw) return raw;

  let text = raw;
  const fenceMatches = text.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 === 1) {
    text += "\n```";
  }

  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) {
    text += "**";
  }

  return text;
}
