const BROCHURE_NOUN =
  /\b(brochure|flyer|leaflet|pamphlet|handout|poster|menu|collateral|tri[\s-]?fold|one[\s-]?pager|print\s*piece)\b/i;

const IMPROVE_VERB =
  /\b(make|improve|better|redesign|upgrade|polish|enhance|refine|fix|modernize|update|revamp|rebuild)\b/i;

/** User attached a brochure/flyer image and wants a faithful redesign — not a generic website. */
export function isBrochureRedesignRequest(userText: string, hasImageAttachment: boolean): boolean {
  if (!hasImageAttachment) return false;
  const t = userText.trim();
  if (!t) return true; // image-only prompt — treat as redesign source
  if (BROCHURE_NOUN.test(t)) return true;
  if (IMPROVE_VERB.test(t) && /\b(brochure|flyer|leaflet|pamphlet|poster|handout|menu|design|layout|print)\b/i.test(t)) {
    return true;
  }
  if (/\b(this|the|attached|uploaded|my)\s+(brochure|flyer|leaflet|pamphlet|poster|handout|menu|print\s*piece)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function buildBrochureRedesignContext(): string {
  return `

## BROCHURE REDESIGN — attached source (overrides all generic website rules)
The user uploaded their **existing brochure/print piece** and wants it **improved but recognizable**. This is NOT a new SaaS landing page.

**Step 1 — Read the attached image**
Extract and reuse: business name, tagline, every paragraph, room/product names, bullet lists, **all prices/rates**, phone, email, website, address, icon labels, section order, and color palette.

**Step 2 — Match the original layout (same skeleton)**
Typical brochure structure to preserve when present:
1. Hero photo band + logo corner
2. Icon feature bar (4 items in a row)
3. Centered title + subtitle + intro paragraphs
4. Horizontal photo gallery row (same number of thumbnails)
5. Three-column block (e.g. rooms | amenities | rates table)
6. Dark footer with tagline + contact + map graphic

**Step 3 — Match the original brand**
- Keep the same mood (e.g. rustic lodge: forest green #2d4a3e, cream #f5f0e8, brown #4a3728, gold accents)
- Serif display headings + readable body serif/sans — **not** generic Inter/Tailwind startup look
- Decorative pine/nature motifs if present — inline SVG is fine
- **Do not** switch to dark purple SaaS, neon gradients, or unrelated industry styling

**Step 4 — Improve (subtle, professional)**
- Tighter alignment, consistent spacing, clearer hierarchy, better contrast
- Cleaner rates table, aligned icons, refined typography sizes
- Optional very subtle hover on gallery — no heavy animation

**Output (Canvas)**
\`\`\`html index.html
\`\`\`css styles.css
- Single-page brochure panel: \`max-width: 920px\`, centered, print-friendly
- **No Tailwind CDN** unless the original clearly used it — use custom CSS in styles.css
- Placeholder photo boxes with correct aspect ratios and labels if you lack image URLs

**FORBIDDEN**
- Inventing a different business, lorem ipsum, or dropping rates/contact/rooms
- Generic "hero + 3 feature cards + pricing SaaS" template that ignores the source
- Claiming you cannot see the attached image
- Apologizing about preview or offering a "simpler version"`;
}
