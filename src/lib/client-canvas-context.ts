import { extractCanvasSections, findCanvasSection, type CanvasSection } from "@/lib/canvas-sections";
import { activeBuildFile } from "@/lib/build-artifact";
import type { ChatBuildArtifact } from "@/lib/chat-types";
import { isHtmlPreviewLanguage, resolveHtmlEntryFile } from "@/lib/html-preview";

export type ClientCanvasContextPayload = {
  artifactLanguage: string;
  artifactCode: string;
  primaryPath?: string;
  selectedSectionId?: string;
  sections: Array<{ id: string; label: string }>;
  projectFiles?: Array<{ path: string; language: string; code: string }>;
};

export function buildClientCanvasContext(
  artifact: ChatBuildArtifact | null,
  selectedPath: string | null,
  selectedSectionId: string | null,
): ClientCanvasContextPayload | undefined {
  if (!artifact) return undefined;

  const entry = resolveHtmlEntryFile(artifact, activeBuildFile(artifact, selectedPath));
  if (!isHtmlPreviewLanguage(entry.language)) return undefined;

  const sections = extractCanvasSections(entry.code);
  const selected = selectedSectionId ? findCanvasSection(sections, selectedSectionId) : null;

  const projectFiles =
    artifact.files && artifact.files.length > 0
      ? artifact.files.map((f) => ({
          path: f.path,
          language: f.language,
          code: f.code,
        }))
      : undefined;

  return {
    artifactLanguage: entry.language,
    artifactCode: entry.code,
    primaryPath: entry.path,
    selectedSectionId: selected?.id,
    sections: sections.map((s) => ({ id: s.id, label: s.label })),
    projectFiles,
  };
}

export function parseCanvasContextPayload(raw: unknown): ClientCanvasContextPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.artifactCode !== "string" || !o.artifactCode.trim()) return null;
  if (typeof o.artifactLanguage !== "string") return null;

  const sections = Array.isArray(o.sections)
    ? o.sections
        .filter(
          (s): s is { id: string; label: string } =>
            s !== null &&
            typeof s === "object" &&
            typeof (s as { id?: unknown }).id === "string" &&
            typeof (s as { label?: unknown }).label === "string",
        )
        .map((s) => ({ id: s.id, label: s.label }))
    : [];

  const projectFiles = Array.isArray(o.projectFiles)
    ? o.projectFiles
        .filter(
          (f): f is { path: string; language: string; code: string } =>
            f !== null &&
            typeof f === "object" &&
            typeof (f as { path?: unknown }).path === "string" &&
            typeof (f as { language?: unknown }).language === "string" &&
            typeof (f as { code?: unknown }).code === "string",
        )
        .map((f) => ({ path: f.path, language: f.language, code: f.code }))
    : undefined;

  return {
    artifactLanguage: o.artifactLanguage,
    artifactCode: o.artifactCode,
    primaryPath: typeof o.primaryPath === "string" ? o.primaryPath : undefined,
    selectedSectionId:
      typeof o.selectedSectionId === "string" ? o.selectedSectionId : undefined,
    sections,
    projectFiles,
  };
}

export function canvasEditPrefill(section: CanvasSection): string {
  return `Update the **${section.label}** section (${section.id}) — keep the rest of the project intact: `;
}
