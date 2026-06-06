import type { SmileBuilderTarget } from "@/lib/smile-system-prompt";

const UI_BUILD_PATTERN =
  /\b(website|web\s*site|landing\s*page|web\s*page|html|homepage|portfolio|storefront|ui|frontend|preview|mockup|redesign|layout|saas|dashboard|marketing\s*site|one[\s-]?pager|sales\s*page|multi[\s-]?page|e[\s-]?commerce|shop)\b/i;

const INTRICATE_PATTERN =
  /\b(intricate|complex|detailed|advanced|sophisticated|production|full[\s-]?stack|interactive|animated|custom|bespoke|high[\s-]?fidelity|pixel[\s-]?perfect|award[\s-]?winning|agency[\s-]?quality)\b/i;

const IMAGE_BUILD_PATTERN =
  /\b(image|logo|icon|illustration|picture|photo|avatar|banner|graphic|svg|draw|generate an image|edit.*image|modify.*image)\b/i;

/** True when the user expects a substantial engineered site (higher output budget). */
export function isIntricateWebBuild(userText: string): boolean {
  return UI_BUILD_PATTERN.test(userText) && INTRICATE_PATTERN.test(userText);
}

export function isWebBuildRequest(userText: string): boolean {
  return UI_BUILD_PATTERN.test(userText);
}

/** Cursor/Codex-style engineering rules for Canvas website builds. */
export function buildOutputSystemContext(
  target: SmileBuilderTarget,
  userText: string,
): string {
  const parts: string[] = [];
  const wantsUi = target === "application" && UI_BUILD_PATTERN.test(userText);
  const intricate = wantsUi && (INTRICATE_PATTERN.test(userText) || wantsUi);

  if (wantsUi) {
    parts.push(`## Canvas — engineered website (Cursor / Codex quality bar)
You are a **senior front-end engineer** shipping real sites in Canvas—not a chatbot dumping a single generic div.

**Architecture first (1 short paragraph outside fences)**
- Audience, brand tone, page goal, then file plan.

**Multi-file project (required for non-trivial sites)**
Output **separate fenced blocks with paths**—Canvas previews the bundled site:
\`\`\`html index.html
\`\`\`css styles.css
\`\`\`javascript main.js
Optional: \`\`\`javascript components/nav.js\`, extra CSS modules, SVG assets inline in HTML.

**index.html must**
- Link \`styles.css\` and defer \`main.js\` (\`<script src="main.js" defer>\`)
- Use semantic landmarks: \`<header>\`, \`<nav id="nav">\`, \`<main>\`, \`<section id="...">\`, \`<footer id="footer">\`
- Stable section ids: \`hero\`, \`features\`, \`showcase\`, \`pricing\`, \`testimonials\`, \`faq\`, \`cta\`, \`footer\`

**styles.css must**
- CSS custom properties for colors, spacing, radii, shadows (\`:root { --accent: ... }\`)
- Mobile-first responsive layout (flex/grid), fluid typography (\`clamp()\`)
- **Intricate polish**: gradient meshes, glassmorphism, subtle box-shadows, hover/focus states, \`@keyframes\` animations, scroll-smooth sections
- Dark/light support or intentional dark theme—never unstyled browser defaults

**main.js must** (when interactions requested)
- Mobile nav toggle, smooth scroll, intersection-based reveal animations, tabs/accordions, form validation, carousel/slider logic
- Vanilla JS—no broken imports; keep self-contained for preview bundle

**Quality bar**
- Looks like a **real product site** (Stripe/Linear/Vercel tier layout quality)—not a tutorial page
- Rich sections: hero with visual depth, feature grid, social proof, pricing or comparison, FAQ, strong CTA
- Accessible: contrast, \`aria-\` labels on icon buttons, focus rings, alt text

**Do not**
- Collapse everything into one unmaintainable HTML blob when CSS/JS belong separate
- Apologize about preview, truncation, or "I'll try a simpler version"
- Ship placeholder lorem without structure—use realistic copy for the niche`);
  }

  if (intricate && wantsUi) {
    parts.push(`## Intricate build — extra depth
This request needs **agency-level** detail:
- Add micro-interactions (button press, card lift, staggered fade-in)
- Use layered backgrounds (gradients + noise/grid overlays via CSS)
- Include at least **6 distinct sections** with unique layouts—not repeated card grids
- Polish typography hierarchy (display + body font pairing via Google Fonts)
- Ensure preview works: all assets inline or linked via project files Canvas can bundle`);
  }

  if (IMAGE_BUILD_PATTERN.test(userText)) {
    parts.push(`## Canvas — visuals
- Logos/icons/diagrams: production \`\`\`svg blocks
- Photo-realistic: call **generate_image**, embed returned markdown
- Hero visuals: prefer CSS art, inline SVG, or subtle gradients over broken external URLs`);
  }

  if (parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}`;
}
