import { getSiteUrl } from "@/lib/site-url";
import { extractLinkedUrls, fetchWebPage } from "@/lib/integrations/fetch-url";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i;
const MD_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_IMAGE = /https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?[^\s)"']*)?/gi;

const CLONE_RE =
  /\b(build|rebuild|clone|recreate|copy|remake|replicate|make|redesign|edit).{0,60}(website|web\s*site|site|page|landing)|this (website|site)|same (website|site)|like (this|that) (website|site)/i;

export function isSiteCloneRequest(text: string): boolean {
  const urls = extractLinkedUrls(text);
  if (!urls.length) return false;
  return CLONE_RE.test(text) || /\b(i want to make edits|editable version)\b/i.test(text);
}

export function extractImageUrlsFromText(text: string, limit = 24): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    try {
      const u = new URL(raw.replace(/[.,;:!?)]+$/, ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      if (!IMAGE_EXT.test(u.pathname) && !/\/(image|img|cover|logo|brand|media|cdn|uploads|assets)\b/i.test(u.href)) {
        // still allow known image CDNs without extension
        if (!/\b(cloudinary|imgix|cdn|cloudfront|supabase|vercel-storage)\b/i.test(u.hostname)) {
          if (!IMAGE_EXT.test(u.href)) return;
        }
      }
      const href = u.href;
      if (!found.includes(href)) found.push(href);
    } catch {
      /* ignore */
    }
  };
  for (const m of text.matchAll(MD_IMAGE)) {
    if (m[1]) push(m[1]);
  }
  for (const m of text.matchAll(BARE_IMAGE)) {
    push(m[0]);
  }
  return found.slice(0, limit);
}

function looksLikeSpaShell(content: string): boolean {
  return (
    /id=["']root["']/i.test(content) ||
    /\/assets\/index-[a-z0-9_-]+\.js/i.test(content) ||
    (/vite/i.test(content) && /<div id=/i.test(content))
  );
}

/**
 * Extra system context when the user asks to rebuild/clone a linked website.
 * Forces use of real absolute asset URLs instead of generate_image / CSS gradients.
 */
export async function buildSiteCloneContext(userText: string): Promise<string> {
  if (!isSiteCloneRequest(userText)) return "";
  const urls = extractLinkedUrls(userText);
  if (!urls.length) return "";

  const blocks: string[] = [];
  for (const url of urls.slice(0, 2)) {
    const res = await fetchWebPage(url);
    if (!res.ok) {
      blocks.push(`### Clone source failed: ${url}\n${res.error}`);
      continue;
    }
    const origin = (() => {
      try {
        return new URL(res.url).origin;
      } catch {
        return res.url;
      }
    })();
    const images = extractImageUrlsFromText(res.content);
    const spa = looksLikeSpaShell(res.content);
    blocks.push(`### Clone source: ${res.title}
**Canonical URL:** ${res.url}
**Origin (use as \`<base href="${origin}/">\`):** ${origin}
${spa ? "**Note:** Source looks like a client-rendered SPA — recreate the *rendered* magazine/site from the content below, do not try to copy Vite/React bundles.\n" : ""}
**Asset URLs (use these exact \`https://\` \`src\` values — do NOT invent placeholders):**
${images.length ? images.map((u, i) => `${i + 1}. ${u}`).join("\n") : "(No image URLs extracted — still avoid fake stock photos; use labeled figure boxes only if unavoidable.)"}

**Page content (source of truth for copy/structure):**
${res.content.length > 14_000 ? `${res.content.slice(0, 14_000)}\n\n[truncated]` : res.content}`);
  }

  return `

## Website clone / rebuild mode (CRITICAL)
The user linked a live site and wants an **editable Canvas recreation** they can tweak.

**You MUST**
1. Output a multi-file Canvas project (\`index.html\` + \`styles.css\` + \`main.js\`).
2. Put \`<base href="{origin}/">\` in \`<head>\` using the origin above (so relative paths work), **and** prefer absolute \`https://\` image URLs from the asset list.
3. Use the **real logo, covers, and hero images** from the asset list — copy those URLs into \`<img src="...">\`.
4. Match section structure and real copy from the page content (issue titles, nav labels, CTAs).
5. Keep the site editable: clear section ids, CSS variables for colors, comments where to swap images.

**You MUST NOT**
- Call **generate_image** for assets that already have URLs above (wastes quota; produces random unrelated photos).
- Replace photography with CSS gradients, emoji, or smiley SVG placeholders when real URLs exist.
- Invent Unsplash/placeholder hosts or lorem magazine titles when the source lists real issues.
- Dump raw API errors into the reply.

If an image URL fails in preview, keep the URL and add \`alt\` text — do not silently swap to gradients.
Optional Canvas-safe proxy (absolute): \`${getSiteUrl().replace(/\/$/, "")}/api/proxy-asset?url=\` + encodeURIComponent(assetUrl)

${blocks.join("\n\n---\n\n")}`;
}
