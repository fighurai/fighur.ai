import type { SmileBuilderTarget } from "@/lib/smile-system-prompt";

const UI_BUILD_PATTERN =
  /\b(website|web\s*site|landing\s*page|web\s*page|html|homepage|portfolio|storefront|ui|frontend|preview|mockup|redesign|layout)\b/i;

const IMAGE_BUILD_PATTERN =
  /\b(image|logo|icon|illustration|picture|photo|avatar|banner|graphic|svg|draw|generate an image|edit.*image|modify.*image)\b/i;

/** Extra system rules when the user is building sites or images in the workspace. */
export function buildOutputSystemContext(
  target: SmileBuilderTarget,
  userText: string,
): string {
  const parts: string[] = [];

  if (target === "application" && UI_BUILD_PATTERN.test(userText)) {
    parts.push(`## Build output — website / UI (FIGHURAI workspace)
- Deliver **one complete, self-contained** \`\`\`html document in a **single** fenced block (inline \`<style>\`; JS only if essential).
- Target **≤180 lines** of HTML so output is never cut off. Prefer clean, simple layouts over huge pages.
- Use inline SVG, CSS gradients, or \`data:image/svg+xml\` for visuals—avoid external image URLs that break in preview.
- Put a **brief** explanation outside the fence (1–3 sentences). **All markup stays inside the fence.**
- **Never** say the preview pane may not work, that code was truncated, or that you will "try a shorter version"—ship working HTML the first time.`);
  }

  if (IMAGE_BUILD_PATTERN.test(userText)) {
    parts.push(`## Build output — images (FIGHURAI workspace)
- For icons/logos/diagrams: output a complete \`\`\`svg block (preferred) or \`\`\`html with one inline image.
- For raster edits: output \`![description](data:image/png;base64,...)\` when feasible; keep base64 compact.
- When the user attached an image to edit, describe the change and output the new SVG or data URL—do not refuse image tasks.
- Do not only describe what you would draw—include the actual image data in the response.`);
  }

  if (parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}`;
}
