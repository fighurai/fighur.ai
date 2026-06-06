import type { ChatBuildArtifact, ChatBuildFile } from "@/lib/chat-types";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const PREVIEW_DEVICE_WIDTHS: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 768,
  mobile: 390,
};

const REACT_LANGUAGES = new Set(["tsx", "jsx", "javascript", "typescript", "js", "ts"]);
const JS_LANGUAGES = new Set(["javascript", "js", "typescript", "ts"]);

const TAILWIND_CLASS_HINT =
  /\b(class|className)=["'][^"']*\b(flex|grid|gap-|p-|px-|py-|m-|mx-|my-|bg-|text-|rounded|shadow|container|max-w-|min-h-|items-|justify-|space-|font-|hover:|md:|lg:)/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

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

function injectBeforeBodyClose(html: string, injection: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function ensureTailwindCdn(html: string): string {
  if (/cdn\.tailwindcss\.com/i.test(html)) return html;
  if (!TAILWIND_CLASS_HINT.test(html)) return html;
  return injectIntoHead(html, `<script src="https://cdn.tailwindcss.com"><\/script>`);
}

function ensureModernFonts(html: string): string {
  if (/fonts\.googleapis\.com/i.test(html)) return html;
  return injectIntoHead(
    html,
    `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">`,
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

function isJsFile(f: ChatBuildFile): boolean {
  return JS_LANGUAGES.has(f.language.toLowerCase()) || /\.(js|mjs|cjs)$/i.test(f.path);
}

function isCssFile(f: ChatBuildFile): boolean {
  return f.language.toLowerCase() === "css" || /\.css$/i.test(f.path);
}

function isHtmlFile(f: ChatBuildFile): boolean {
  const lang = f.language.toLowerCase();
  return lang === "html" || lang === "htm" || /\.html?$/i.test(f.path);
}

/** Pick index.html or best HTML entry for multi-file projects. */
export function resolveHtmlEntryFile(
  artifact: ChatBuildArtifact,
  activeFile: { path: string; language: string; code: string },
): { path: string; language: string; code: string } {
  const files = artifact.files ?? [];
  if (files.length === 0) return activeFile;

  if (isHtmlFile(activeFile as ChatBuildFile)) return activeFile;

  const index =
    files.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ||
    files.find((f) => isHtmlFile(f));
  if (index) return index;
  return activeFile;
}

/** Merge project CSS into HTML (link tags + inline bundle). */
export function mergeArtifactStyles(
  artifact: ChatBuildArtifact,
  htmlCode: string,
): string {
  const cssFiles = (artifact.files ?? []).filter(isCssFile);
  if (cssFiles.length === 0) return htmlCode;

  let result = htmlCode;

  for (const file of cssFiles) {
    const name = basename(file.path);
    const code = file.code.trim();
    if (!code) continue;
    const linkRe = new RegExp(
      `<link\\s+[^>]*href=["'][^"']*${escapeRegex(name)}["'][^>]*\\/?>`,
      "gi",
    );
    result = result.replace(linkRe, `<style>\n/* ${name} */\n${code}\n</style>`);
  }

  const stillExternal = cssFiles.some((f) => {
    const name = basename(f.path);
    return new RegExp(`href=["'][^"']*${escapeRegex(name)}["']`, "i").test(result);
  });

  if (!stillExternal) return result;

  const bundle = cssFiles.map((f) => f.code.trim()).filter(Boolean).join("\n\n");
  if (!bundle) return result;
  const styleTag = `<style>\n${bundle}\n</style>`;
  if (/<\/head>/i.test(result)) {
    return result.replace(/<\/head>/i, `${styleTag}\n</head>`);
  }
  return `${styleTag}\n${result}`;
}

/** Merge project JS into HTML for iframe preview (replace script src + append). */
export function mergeArtifactScripts(
  artifact: ChatBuildArtifact,
  htmlCode: string,
): string {
  const jsFiles = (artifact.files ?? []).filter(isJsFile);
  if (jsFiles.length === 0) return htmlCode;

  let result = htmlCode;
  const inlined = new Set<string>();

  for (const file of jsFiles) {
    const name = basename(file.path);
    const srcRe = new RegExp(
      `<script\\s+[^>]*src=["'][^"']*${escapeRegex(name)}["'][^>]*>\\s*</script>`,
      "gi",
    );
    if (srcRe.test(result)) {
      result = result.replace(
        srcRe,
        `<script>\n/* ${file.path} */\n${file.code}\n</script>`,
      );
      inlined.add(file.path);
    }
  }

  const remaining = jsFiles.filter((f) => !inlined.has(f.path));
  if (remaining.length > 0) {
    const bundle = remaining.map((f) => `/* ${f.path} */\n${f.code}`).join("\n\n");
    result = injectBeforeBodyClose(result, `<script>\n${bundle}\n</script>`);
  }

  return result;
}

/** Full multi-file static site bundle for Canvas preview. */
export function bundleProjectPreview(
  artifact: ChatBuildArtifact,
  htmlCode: string,
): string {
  let html = htmlCode;
  html = mergeArtifactStyles(artifact, html);
  html = mergeArtifactScripts(artifact, html);
  html = normalizeHtmlForPreview(html);
  return html;
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

  const entry = resolveHtmlEntryFile(artifact, activeFile);
  if (isHtmlPreviewLanguage(entry.language)) {
    const doc = bundleProjectPreview(artifact, entry.code);
    return { doc, mode: "html", language: entry.language };
  }

  return { doc: "", mode: "none", language: lang };
}

export function openPreviewInNewTab(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
