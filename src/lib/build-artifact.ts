import type { ChatBuildArtifact } from "@/lib/chat-types";
import { extractImagePreviewUrl } from "@/lib/workspace-download";

const CODE_LANGUAGES = new Set([
  "html",
  "htm",
  "tsx",
  "jsx",
  "javascript",
  "typescript",
  "css",
  "json",
  "python",
  "sql",
]);

const IMAGE_LANGUAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "image"]);

export function extractBuildArtifact(text: string): ChatBuildArtifact | null {
  const imageUrl = extractImagePreviewUrl(text);
  if (imageUrl) {
    return { language: "image", code: imageUrl };
  }

  const fence = /```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  const matches: ChatBuildArtifact[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = fence.exec(text)) !== null) {
    matches.push({
      language: (match[1] || "text").toLowerCase(),
      code: match[2].trim(),
    });
  }
  if (matches.length === 0) return null;

  const html = matches.find((m) => m.language === "html" || m.language === "htm");
  if (html) return html;

  const code = matches.find((m) => CODE_LANGUAGES.has(m.language));
  if (code) return code;

  const image = matches.find((m) => IMAGE_LANGUAGES.has(m.language));
  if (image) return image;

  return matches[0];
}

export function stripCodeFences(text: string): string {
  const withoutCode = text.replace(/```[a-zA-Z0-9_-]*[ \t]*\r?\n[\s\S]*?```/g, "");
  return withoutCode.replace(/\n{3,}/g, "\n\n").trim();
}
