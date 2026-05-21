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

const IMAGE_URL_PATTERN =
  /(?:!\[[^\]]*]\(\s*(data:image\/[^)\s]+|https?:\/\/[^)\s]+)\s*\)|<img[^>]+src=["'](data:image\/[^"']+|https?:\/\/[^"']+)["']|(data:image\/[a-z0-9+.-]+;base64,[a-z0-9+/=\s]+))/gi;

function normalizeImageMatch(match: RegExpExecArray): string | null {
  const raw = (match[1] || match[2] || match[3] || "").trim();
  if (!raw) return null;
  return raw.startsWith("data:image/") ? raw.replace(/\s/g, "") : raw;
}

/** Pull the first inline or markdown image URL from assistant text. */
export function extractImagePreviewUrl(text: string): string | null {
  const all = extractAllImagePreviewUrls(text);
  return all[0] ?? null;
}

/** All downloadable image URLs in assistant output. */
export function extractAllImagePreviewUrls(text: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null = null;
  const re = new RegExp(IMAGE_URL_PATTERN.source, IMAGE_URL_PATTERN.flags);
  while ((match = re.exec(text)) !== null) {
    const url = normalizeImageMatch(match);
    if (url) found.push(url);
  }
  return [...new Set(found)];
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
