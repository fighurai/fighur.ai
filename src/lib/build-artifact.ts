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

export type ExtractBuildArtifactOptions = {
  /** Parse the last unclosed ``` fence (for live streaming preview). */
  allowOpenFence?: boolean;
};

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

function inferPathFromCode(code: string, language: string, index: number, path?: string): string {
  if (path) return path;
  const first = code.split("\n").find((l) => /^(?:\/\/|#)\s*file:\s*/i.test(l));
  const m = first?.match(/^(?:\/\/|#)\s*file:\s*(.+)$/i);
  if (m?.[1]?.trim()) return m[1].trim();
  return `file-${index + 1}.${language || "txt"}`;
}

function collectClosedCodeFences(text: string): ChatBuildFile[] {
  const fence = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
  const files: ChatBuildFile[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = fence.exec(text)) !== null) {
    const { language, path } = parseFenceMeta(match[1] || "");
    const code = match[2].trim();
    if (!code) continue;
    files.push({
      path: inferPathFromCode(code, language, files.length, path),
      language,
      code,
    });
  }
  return files;
}

/** Last unclosed fence — enough content to preview HTML while the model is still streaming. */
function collectOpenCodeFence(text: string): ChatBuildFile | null {
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 0) return null;

  const lastOpen = text.lastIndexOf("```");
  if (lastOpen === -1) return null;

  const tail = text.slice(lastOpen);
  const match = /^```([^\n`]*)\r?\n([\s\S]*)$/.exec(tail);
  if (!match) return null;

  const { language, path } = parseFenceMeta(match[1] || "");
  const code = match[2].trim();
  if (code.length < 24) return null;

  return {
    path: inferPathFromCode(code, language, 0, path),
    language,
    code,
  };
}

function pickPrimary(files: ChatBuildFile[]): ChatBuildFile {
  const indexHtml = files.find(
    (f) =>
      (f.language === "html" || f.language === "htm") &&
      /(^|\/)index\.html?$/i.test(f.path),
  );
  if (indexHtml) return indexHtml;
  const html = files.find((f) => f.language === "html" || f.language === "htm");
  if (html) return html;
  const code = files.find((f) => CODE_LANGUAGES.has(f.language));
  if (code) return code;
  const image = files.find((f) => IMAGE_LANGUAGES.has(f.language));
  if (image) return image;
  return files[0];
}

function artifactFromFiles(files: ChatBuildFile[], incomplete = false): ChatBuildArtifact | null {
  if (files.length === 0) return null;
  const primary = pickPrimary(files);
  if (files.length === 1) {
    return {
      language: primary.language,
      code: primary.code,
      primaryPath: primary.path,
      incomplete,
    };
  }
  return {
    language: primary.language,
    code: primary.code,
    files,
    primaryPath: primary.path,
    incomplete,
  };
}

export function extractBuildArtifact(
  text: string,
  options?: ExtractBuildArtifactOptions,
): ChatBuildArtifact | null {
  const imageUrl = extractImagePreviewUrl(text);
  if (imageUrl) {
    return { language: "image", code: imageUrl };
  }

  const closed = collectClosedCodeFences(text);
  if (closed.length > 0) {
    return artifactFromFiles(closed, false);
  }

  if (options?.allowOpenFence) {
    const open = collectOpenCodeFence(text);
    if (open) {
      return artifactFromFiles([open], true);
    }
  }

  return null;
}

export { normalizeHtmlForPreview, composePreviewDocument } from "@/lib/html-preview";

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
