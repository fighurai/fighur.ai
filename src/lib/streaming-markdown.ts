/**
 * Narration visible in chat while tokens stream — hides code fences and
 * raw markdown heading markers so the bubble doesn't flash `###` before
 * react-markdown finalizes the reply.
 */
export function streamingNarration(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/```device-ops[\s\S]*?```/gi, "");
  text = text.replace(/```[^\n`]*\r?\n[\s\S]*?```/g, "");

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    const lastOpen = text.lastIndexOf("```");
    if (lastOpen !== -1) text = text.slice(0, lastOpen);
  }

  text = softenMarkdownForStream(text);
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * Soften markdown while streaming: show heading titles without `#` hashes,
 * and hold incomplete trailing markers.
 */
export function softenMarkdownForStream(raw: string): string {
  if (!raw) return raw;
  let text = raw;

  // Completed heading lines → plain title (Markdown will restyle on finalize)
  text = text.replace(/^(#{1,6})[ \t]+(.+)$/gm, "$2");

  // Incomplete trailing heading (only hashes / hashes + partial whitespace)
  text = text.replace(/(?:^|\n)(#{1,6})[ \t]*$/u, (m) => (m.startsWith("\n") ? "\n" : ""));

  // Unclosed bold at the very end — hide the dangling marker chunk
  if ((text.match(/\*\*/g) || []).length % 2 === 1) {
    text = text.replace(/\*\*[^*]*$/u, (m) => m.replace(/^\*\*/, ""));
  }

  return text;
}

/** @deprecated alias — prefer softenMarkdownForStream */
export function holdIncompleteMarkdown(raw: string): string {
  return softenMarkdownForStream(raw);
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
