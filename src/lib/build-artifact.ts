import type { ChatBuildArtifact, ChatBuildFile } from "@/lib/chat-types";
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

/** Parse optional path from fence info: `typescript src/foo.ts` or `html:index.html` */
function parseFenceMeta(info: string): { language: string; path?: string } {
  const raw = info.trim();
  if (!raw) return { language: "text" };
  const colon = raw.indexOf(":");
  if (colon > 0) {
    return {
      language: raw.slice(0, colon).toLowerCase(),
      path: raw.slice(colon + 1).trim(),
    };
  }
  const parts = raw.split(/\s+/);
  const lang = parts[0].toLowerCase();
  const rest = parts.slice(1).join(" ").trim();
  if (rest && (rest.includes("/") || rest.includes("."))) {
    return { language: lang, path: rest };
  }
  return { language: lang };
}

function collectCodeFences(text: string): ChatBuildFile[] {
  const fence = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
  const files: ChatBuildFile[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = fence.exec(text)) !== null) {
    const { language, path } = parseFenceMeta(match[1] || "");
    const code = match[2].trim();
    if (!code) continue;
    const inferredPath =
      path ||
      (() => {
        const first = code.split("\n").find((l) => /^(?:\/\/|#)\s*file:\s*/i.test(l));
        const m = first?.match(/^(?:\/\/|#)\s*file:\s*(.+)$/i);
        return m?.[1]?.trim();
      })();
    files.push({
      path: inferredPath || `file-${files.length + 1}.${language || "txt"}`,
      language,
      code,
    });
  }
  return files;
}

function pickPrimary(files: ChatBuildFile[]): ChatBuildFile {
  const html = files.find((f) => f.language === "html" || f.language === "htm");
  if (html) return html;
  const code = files.find((f) => CODE_LANGUAGES.has(f.language));
  if (code) return code;
  const image = files.find((f) => IMAGE_LANGUAGES.has(f.language));
  if (image) return image;
  return files[0];
}

export function extractBuildArtifact(text: string): ChatBuildArtifact | null {
  const imageUrl = extractImagePreviewUrl(text);
  if (imageUrl) {
    return { language: "image", code: imageUrl };
  }

  const files = collectCodeFences(text);
  if (files.length === 0) return null;

  const primary = pickPrimary(files);
  if (files.length === 1) {
    return {
      language: primary.language,
      code: primary.code,
      primaryPath: primary.path,
    };
  }

  return {
    language: primary.language,
    code: primary.code,
    files,
    primaryPath: primary.path,
  };
}

export function activeBuildFile(
  artifact: ChatBuildArtifact,
  selectedPath: string | null,
): { path: string; language: string; code: string } {
  if (artifact.files && artifact.files.length > 0) {
    const found =
      (selectedPath && artifact.files.find((f) => f.path === selectedPath)) ||
      artifact.files.find((f) => f.path === artifact.primaryPath) ||
      artifact.files[0];
    return found;
  }
  return {
    path: artifact.primaryPath ?? "main",
    language: artifact.language,
    code: artifact.code,
  };
}

export function stripCodeFences(text: string): string {
  const withoutCode = text.replace(/```[^\n`]*\r?\n[\s\S]*?```/g, "");
  return withoutCode.replace(/\n{3,}/g, "\n\n").trim();
}
