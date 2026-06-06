export type CanvasSection = {
  id: string;
  label: string;
  html: string;
};

const LABEL_BY_ID: Record<string, string> = {
  nav: "Navigation",
  navigation: "Navigation",
  header: "Header",
  hero: "Hero",
  features: "Features",
  feature: "Features",
  pricing: "Pricing",
  plans: "Pricing",
  testimonials: "Testimonials",
  reviews: "Testimonials",
  social: "Social proof",
  stats: "Stats",
  cta: "Call to action",
  footer: "Footer",
  about: "About",
  faq: "FAQ",
  gallery: "Gallery",
  contact: "Contact",
};

function labelForId(id: string): string {
  const key = id.toLowerCase().replace(/[-_\s]+/g, "");
  for (const [k, label] of Object.entries(LABEL_BY_ID)) {
    if (key === k || key.includes(k)) return label;
  }
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pushUnique(sections: CanvasSection[], next: CanvasSection): void {
  if (sections.some((s) => s.id === next.id)) return;
  sections.push(next);
}

/** Parse editable sections from Canvas HTML for targeted rewrites. */
export function extractCanvasSections(html: string): CanvasSection[] {
  const trimmed = html.trim();
  if (!trimmed) return [];

  const sections: CanvasSection[] = [];
  const tagged =
    /<(section|header|nav|footer|main|article)\b([^>]*)\sid=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagged.exec(trimmed)) !== null) {
    const tag = match[1].toLowerCase();
    const id = match[3].trim();
    if (!id) continue;
    const block = match[0];
    pushUnique(sections, {
      id,
      label: tag === "nav" ? "Navigation" : labelForId(id),
      html: block,
    });
  }

  if (sections.length > 0) return sections;

  const bareIds =
    /<(section|header|nav|footer|main|article)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let index = 0;
  while ((match = bareIds.exec(trimmed)) !== null) {
    index += 1;
    const tag = match[1].toLowerCase();
    const id = `${tag}-${index}`;
    pushUnique(sections, {
      id,
      label: tag === "nav" ? "Navigation" : tag === "footer" ? "Footer" : `Section ${index}`,
      html: match[0],
    });
  }

  return sections;
}

export function findCanvasSection(sections: CanvasSection[], id: string): CanvasSection | null {
  return sections.find((s) => s.id === id) ?? null;
}
