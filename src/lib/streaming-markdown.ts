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
