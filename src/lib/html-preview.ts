import type { ChatBuildArtifact } from "@/lib/chat-types";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const PREVIEW_DEVICE_WIDTHS: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 768,
  mobile: 390,
};

const REACT_LANGUAGES = new Set(["tsx", "jsx", "javascript", "typescript"]);

const TAILWIND_CLASS_HINT =
  /\b(class|className)=["'][^"']*\b(flex|grid|gap-|p-|px-|py-|m-|mx-|my-|bg-|text-|rounded|shadow|container|max-w-|min-h-|items-|justify-|space-|font-|hover:|md:|lg:)/;

function extractStyleBlocks(html: string): string {
  const blocks: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]?.trim()) blocks.push(m[1].trim());
  }
  return blocks.join("\n");
}

function injectIntoHead(html: string, injection: string): string {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}\n`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${injection}\n</head>`);
  }
  return injection + html;
}

function ensureTailwindCdn(html: string): string {
  if (/cdn\.tailwindcss\.com/i.test(html)) return html;
  if (!TAILWIND_CLASS_HINT.test(html)) return html;
  return injectIntoHead(
    html,
    `<script src="https://cdn.tailwindcss.com"><\/script>`,
  );
}

function ensureModernFonts(html: string): string {
  if (/fonts\.googleapis\.com/i.test(html)) return html;
  return injectIntoHead(
    html,
    `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">`,
  );
}

function ensureBaseStyles(html: string): string {
  const base = `<style>
:root { color-scheme: light dark; }
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: "Inter", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
img, video { max-width: 100%; height: auto; display: block; }
a { color: inherit; }
</style>`;
  if (/<style[\s>]/i.test(html)) return html;
  return injectIntoHead(html, base);
}

/** Merge sibling CSS files from a multi-file artifact into HTML for preview. */
export function mergeArtifactStyles(
  artifact: ChatBuildArtifact,
  htmlCode: string,
): string {
  const cssFiles =
    artifact.files?.filter((f) => f.language === "css").map((f) => f.code.trim()).filter(Boolean) ??
    [];
  if (cssFiles.length === 0) return htmlCode;

  const bundle = cssFiles.join("\n\n");
  const inline = extractStyleBlocks(htmlCode);
  const combined = inline ? `${inline}\n\n${bundle}` : bundle;
  const styleTag = `<style>\n${combined}\n</style>`;

  if (/<\/head>/i.test(htmlCode)) {
    return htmlCode.replace(/<\/head>/i, `${styleTag}\n</head>`);
  }
  if (/<head[\s>]/i.test(htmlCode)) {
    return htmlCode.replace(/<head([^>]*)>/i, `<head$1>\n${styleTag}\n`);
  }
  return `${styleTag}\n${htmlCode}`;
}

function stripModuleSyntax(source: string): string {
  return source
    .replace(/^import\s+.+$/gm, "")
    .replace(/^export\s+default\s+/gm, "const __App = ")
    .replace(/^export\s+/gm, "")
    .trim();
}

function detectReactComponentName(source: string): string {
  const fn = source.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
  if (fn?.[1]) return fn[1];
  const arrow = source.match(/(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_]+)\s*=>/);
  if (arrow?.[1]) return arrow[1];
  if (/const\s+__App\s*=/.test(source)) return "__App";
  return "App";
}

/** Run a single-file React/TSX component in an iframe via Babel standalone. */
export function wrapReactForPreview(source: string, language: string): string {
  const cleaned = stripModuleSyntax(source);
  const component = detectReactComponentName(cleaned);
  const scriptType = language === "tsx" || language === "typescript" ? "text/babel" : "text/babel";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;font-family:Inter,system-ui,sans-serif}#root{min-height:100vh}</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head>
<body>
<div id="root"></div>
<script type="${scriptType}">
${cleaned}
const __Root = typeof ${component} !== "undefined" ? ${component} : (typeof __App !== "undefined" ? __App : () => React.createElement("div", null, "Component not found"));
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__Root));
</script>
</body>
</html>`;
}

export function isReactPreviewLanguage(language: string): boolean {
  return REACT_LANGUAGES.has(language.toLowerCase());
}

export function isHtmlPreviewLanguage(language: string): boolean {
  const lang = language.toLowerCase();
  return lang === "html" || lang === "htm";
}

/** Wrap HTML fragments in a modern document shell for iframe preview. */
export function normalizeHtmlForPreview(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;

  let html = trimmed;
  if (!/<!doctype/i.test(html) && !/<html[\s>]/i.test(html)) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${html}
</body>
</html>`;
  }

  html = ensureModernFonts(html);
  html = ensureBaseStyles(html);
  html = ensureTailwindCdn(html);
  return html;
}

export function composePreviewDocument(
  artifact: ChatBuildArtifact | null,
  activeFile: { path: string; language: string; code: string } | null,
): { doc: string; mode: "html" | "react" | "none"; language: string } {
  if (!artifact || !activeFile) return { doc: "", mode: "none", language: "" };

  const lang = activeFile.language.toLowerCase();

  if (isReactPreviewLanguage(lang) && !isHtmlPreviewLanguage(lang)) {
    return { doc: wrapReactForPreview(activeFile.code, lang), mode: "react", language: lang };
  }

  if (isHtmlPreviewLanguage(lang)) {
    let html = mergeArtifactStyles(artifact, activeFile.code);
    html = normalizeHtmlForPreview(html);
    return { doc: html, mode: "html", language: lang };
  }

  return { doc: "", mode: "none", language: lang };
}

export function openPreviewInNewTab(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
