/**
 * Narration visible in chat while tokens stream — hides code fences and
 * raw markdown heading markers so the bubble doesn't flash `###` before
 * react-markdown finalizes the reply.
 */
export function streamingNarration(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/```device-ops[\s\S]*?```/gi, "");
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
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ATX headings (with or without space): "### Title", "###Title", "  ## "
  // Strip 1–6 leading hashes on each line so hashes never paint mid-stream.
  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");

  // Closing ATX hashes: "Title ###" left after opener strip
  text = text.replace(/[ \t]+#+[ \t]*$/gm, "");

  // Incomplete trailing bare hashes if any survived (e.g. odd token splits)
  text = text.replace(/(?:^|\n)[ \t]*#{1,6}[ \t]*$/g, (m) => (m.startsWith("\n") ? "\n" : ""));

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
