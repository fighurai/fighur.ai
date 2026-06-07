/**
 * Narration visible in chat while tokens stream — hides code fences (open and closed)
 * so the bubble shows explanation text, not raw ``` blocks.
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
