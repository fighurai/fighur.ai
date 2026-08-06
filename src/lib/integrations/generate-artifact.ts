export type ArtifactFormat = "markdown" | "csv" | "json" | "html" | "txt";

export type ArtifactResult =
  | {
      ok: true;
      format: ArtifactFormat;
      filename: string;
      mimeType: string;
      /** Content for the model to present */
      content: string;
      /** Markdown download hint using data URL (small files) */
      markdownDownload: string;
    }
  | { ok: false; error: string };

const MAX_CONTENT = 100_000;

const MIME: Record<ArtifactFormat, string> = {
  markdown: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  html: "text/html;charset=utf-8",
  txt: "text/plain;charset=utf-8",
};

const EXT: Record<ArtifactFormat, string> = {
  markdown: "md",
  csv: "csv",
  json: "json",
  html: "html",
  txt: "txt",
};

export function generateArtifact(input: {
  title?: string;
  format: string;
  content: string;
  filename?: string;
}): ArtifactResult {
  const formatRaw = (input.format || "markdown").toLowerCase().trim();
  const format = (
    ["markdown", "csv", "json", "html", "txt"].includes(formatRaw) ? formatRaw : null
  ) as ArtifactFormat | null;
  if (!format) {
    return { ok: false, error: "format must be markdown|csv|json|html|txt" };
  }
  const content = (input.content || "").trim();
  if (!content) return { ok: false, error: "content is required" };
  if (content.length > MAX_CONTENT) {
    return { ok: false, error: `content too long (max ${MAX_CONTENT} chars)` };
  }

  if (format === "json") {
    try {
      JSON.parse(content);
    } catch {
      return { ok: false, error: "content is not valid JSON" };
    }
  }

  const base =
    (input.filename || input.title || "fighur-artifact")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "fighur-artifact";
  const filename = base.endsWith(`.${EXT[format]}`) ? base : `${base}.${EXT[format]}`;
  const mimeType = MIME[format];
  const dataUrl = `data:${mimeType};base64,${Buffer.from(content, "utf8").toString("base64")}`;
  const markdownDownload = `[Download ${filename}](${dataUrl})`;

  return {
    ok: true,
    format,
    filename,
    mimeType,
    content,
    markdownDownload,
  };
}
