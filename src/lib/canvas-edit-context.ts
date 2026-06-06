import { findCanvasSection, extractCanvasSections } from "@/lib/canvas-sections";
import type { ClientCanvasContextPayload } from "@/lib/client-canvas-context";

const MAX_FILE_CHARS = 8_000;
const MAX_SECTION_SNippet = 4_000;

function clip(code: string, max: number): string {
  if (code.length <= max) return code;
  return `${code.slice(0, max)}\n/* … truncated … */`;
}

/** Inject active Canvas project so the model can rewrite like Cursor (multi-file aware). */
export function buildCanvasEditSystemContext(ctx: ClientCanvasContextPayload | null): string {
  if (!ctx?.artifactCode?.trim()) return "";

  const sections =
    ctx.sections.length > 0
      ? ctx.sections
      : extractCanvasSections(ctx.artifactCode).map((s) => ({ id: s.id, label: s.label }));

  const sectionList =
    sections.length > 0
      ? sections.map((s) => `- \`${s.id}\` — ${s.label}`).join("\n")
      : "- Add stable section ids on major blocks";

  let focused = "";
  if (ctx.selectedSectionId) {
    const section = findCanvasSection(extractCanvasSections(ctx.artifactCode), ctx.selectedSectionId);
    if (section) {
      focused = `

### Focused section: \`${section.id}\` (${section.label})
Edit primarily this section. Return the **full updated project** (all files)—keep other sections and ids stable.

\`\`\`html
${clip(section.html, MAX_SECTION_SNippet)}
\`\`\``;
    }
  }

  const projectFiles =
    ctx.projectFiles && ctx.projectFiles.length > 0
      ? ctx.projectFiles
      : [{ path: ctx.primaryPath ?? "index.html", language: ctx.artifactLanguage, code: ctx.artifactCode }];

  const fileBlocks = projectFiles
    .map(
      (f) => `\`\`\`${f.language} ${f.path}
${clip(f.code, MAX_FILE_CHARS)}
\`\`\``,
    )
    .join("\n\n");

  return `

## Canvas — active project (engineer like Cursor)
The user is iterating on a **multi-file site** in Canvas. Return the **complete updated project**—every file that changed, with paths on fences (\`\`\`html index.html\`, \`\`\`css styles.css\`, \`\`\`javascript main.js\`).

**Sections**
${sectionList}

**Rules**
- Preserve architecture: separate HTML / CSS / JS unless user asks to merge.
- Keep section \`id\` attributes stable when editing one section.
- Maintain intricate CSS (variables, animations) and working JS—do not dumb down to a basic page.
- Never apologize about preview or offer a simpler version.
${focused}

### Current project files
${fileBlocks}`;
}
