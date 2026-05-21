import type { ChatBuildArtifact } from "@/lib/chat-types";

const EXT_BY_LANGUAGE: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  python: "py",
  py: "py",
  markdown: "md",
  md: "md",
  svg: "svg",
  xml: "xml",
  sql: "sql",
  shell: "sh",
  bash: "sh",
  text: "txt",
  txt: "txt",
  image: "png",
};

const IMAGE_LANGUAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "image"]);

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function extensionForLanguage(language: string): string {
  const key = language.toLowerCase();
  return EXT_BY_LANGUAGE[key] ?? "txt";
}

export function buildCodeFilename(artifact: ChatBuildArtifact): string {
  const ext = extensionForLanguage(artifact.language);
  if (ext === "html") return "index.html";
  if (ext === "tsx" || ext === "jsx") return `component.${ext}`;
  return `build.${ext}`;
}

export function downloadBuildCode(artifact: ChatBuildArtifact) {
  const lang = artifact.language.toLowerCase();
  const mime =
    lang === "html" || lang === "htm"
      ? "text/html;charset=utf-8"
      : lang === "svg"
        ? "image/svg+xml;charset=utf-8"
        : "text/plain;charset=utf-8";
  const blob = new Blob([artifact.code], { type: mime });
  triggerDownload(buildCodeFilename(artifact), blob);
}

/** Pull the first inline or markdown image URL from assistant text. */
export function extractImagePreviewUrl(text: string): string | null {
  const markdown = /!\[[^\]]*]\(\s*(data:image\/[^)\s]+|https?:\/\/[^)\s]+)\s*\)/i.exec(text);
  if (markdown?.[1]) return markdown[1].trim();

  const html = /<img[^>]+src=["'](data:image\/[^"']+|https?:\/\/[^"']+)["']/i.exec(text);
  if (html?.[1]) return html[1].trim();

  const bare = /(data:image\/[a-z0-9+.-]+;base64,[a-z0-9+/=\s]+)/i.exec(text);
  if (bare?.[1]) return bare[1].replace(/\s/g, "");

  return null;
}

export function isImageArtifact(artifact: ChatBuildArtifact | null): boolean {
  if (!artifact?.code?.trim()) return false;
  const lang = artifact.language.toLowerCase();
  if (IMAGE_LANGUAGES.has(lang)) return true;
  const code = artifact.code.trim();
  return code.startsWith("data:image/") || /^https?:\/\//i.test(code);
}

export function resolveImagePreviewUrl(artifact: ChatBuildArtifact | null): string | null {
  if (!artifact) return null;
  const code = artifact.code.trim();
  if (code.startsWith("data:image/") || /^https?:\/\//i.test(code)) return code;

  const lang = artifact.language.toLowerCase();
  if (lang === "html" || lang === "htm") {
    return extractImagePreviewUrl(code);
  }
  if (IMAGE_LANGUAGES.has(lang)) {
    if (code.includes("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
    const mime =
      lang === "svg"
        ? "image/svg+xml"
        : lang === "jpg" || lang === "jpeg"
          ? "image/jpeg"
          : `image/${lang}`;
    const compact = code.replace(/\s/g, "");
    if (/^[a-z0-9+/=]+$/i.test(compact)) return `data:${mime};base64,${compact}`;
  }
  return null;
}

function extensionFromDataUrl(dataUrl: string): string {
  const match = /^data:image\/([a-z0-9+.-]+)/i.exec(dataUrl);
  if (!match) return "png";
  const subtype = match[1].toLowerCase();
  if (subtype.includes("svg")) return "svg";
  if (subtype.includes("jpeg") || subtype === "jpg") return "jpg";
  if (subtype.includes("webp")) return "webp";
  if (subtype.includes("gif")) return "gif";
  return "png";
}

export async function downloadImageUrl(src: string, baseName = "generated-image") {
  if (src.startsWith("data:")) {
    const ext = extensionFromDataUrl(src);
    const res = await fetch(src);
    const blob = await res.blob();
    triggerDownload(`${baseName}.${ext}`, blob);
    return;
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error("Could not download image");
  const blob = await res.blob();
  const ext = extensionFromDataUrl(blob.type ? `data:${blob.type};base64,` : "data:image/png");
  triggerDownload(`${baseName}.${ext}`, blob);
}
