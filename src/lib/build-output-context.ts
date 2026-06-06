import type { SmileBuilderTarget } from "@/lib/smile-system-prompt";

const UI_BUILD_PATTERN =
  /\b(website|web\s*site|landing\s*page|web\s*page|html|homepage|portfolio|storefront|ui|frontend|preview|mockup|redesign|layout|saas|dashboard|marketing\s*site|one[\s-]?pager|sales\s*page)\b/i;

const IMAGE_BUILD_PATTERN =
  /\b(image|logo|icon|illustration|picture|photo|avatar|banner|graphic|svg|draw|generate an image|edit.*image|modify.*image)\b/i;

const MODERN_UI_PATTERN =
  /\b(modern|professional|polished|premium|beautiful|intuitive|sleek|high[\s-]?end|production[\s-]?ready|like (apple|stripe|vercel|linear|notion))\b/i;

/** Extra system rules when the user is building sites or images in the Canvas. */
export function buildOutputSystemContext(
  target: SmileBuilderTarget,
  userText: string,
): string {
  const parts: string[] = [];
  const wantsUi =
    target === "application" && (UI_BUILD_PATTERN.test(userText) || MODERN_UI_PATTERN.test(userText));

  if (wantsUi) {
    parts.push(`## Canvas output — modern website / UI (FIGHURAI)
You are competing with ChatGPT Canvas and Claude Artifacts. Ship **production-quality**, intuitive pages—not basic placeholder layouts.

**Format**
- One primary \`\`\`html document (preferred) OR \`\`\`tsx for React UI—in a **single** fenced block.
- Include \`<script src="https://cdn.tailwindcss.com"><\/script>\` in \`<head>\` and build with **Tailwind utility classes**.
- Target **≤220 lines**; stay complete (do not truncate). Brief explanation **outside** the fence only.

**Design bar (required)**
- **Hero** with clear headline, subcopy, primary + secondary CTA buttons.
- **Navigation** (logo text + 3–5 links) sticky or top-aligned.
- **Feature section** (3–6 cards with icons or emoji + title + description).
- **Social proof** (stats row, testimonial quotes, or logo strip—use text/SVG placeholders).
- **Final CTA** band and a **footer** (links + copyright).
- **Responsive**: mobile-first; use \`md:\` / \`lg:\` breakpoints; no horizontal scroll on mobile.
- **Visual polish**: gradient or mesh background, soft shadows, rounded-2xl cards, hover transitions, generous whitespace.
- **Typography**: use Inter or Plus Jakarta Sans (Google Fonts CDN ok).
- **Color**: cohesive palette with CSS variables or Tailwind theme extension—avoid default unstyled gray boxes.

**Do**
- Use inline SVG icons, CSS gradients, and subtle \`animate-\` / transition classes.
- Make CTAs obvious; hierarchy clear; spacing consistent (8px grid).

**Don't**
- Ship a single centered div with "Welcome to my website".
- Apologize about preview, truncation, or "shorter versions".
- Rely on broken external images—use SVG, gradients, or \`picsum.photos\` sparingly with alt text.`);
  }

  if (IMAGE_BUILD_PATTERN.test(userText)) {
    parts.push(`## Canvas output — images & brand (FIGHURAI)
- Logos/icons/diagrams: polished \`\`\`svg with viewBox, gradients, and clean geometry.
- UI mockups: prefer \`\`\`html + Tailwind for interactive preview over static descriptions.
- Raster: compact \`![desc](data:image/...)\` when needed; never refuse editable SVG/logo tasks.
- Match the site's visual style (colors, stroke weight, rounded corners) when editing brand assets.`);
  }

  if (parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}`;
}
