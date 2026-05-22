/** Device folder manifest sent from browser → /api/chat for CoWork tools. */

export type DeviceManifestEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  mimeType?: string;
  /** Text preview for small text files (server-side cap applied again). */
  content?: string;
};

export type DeviceManifest = {
  rootName: string;
  indexedAt: string;
  entries: DeviceManifestEntry[];
};

const MAX_ENTRIES = 200;
const MAX_CONTENT_PER_FILE = 12_000;
const MAX_TOTAL_CONTENT = 48_000;

export function parseDeviceManifest(raw: unknown): DeviceManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.rootName !== "string" || !Array.isArray(o.entries)) return null;
  const entries: DeviceManifestEntry[] = [];
  let contentBudget = MAX_TOTAL_CONTENT;

  for (const item of o.entries.slice(0, MAX_ENTRIES)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.path !== "string" || typeof e.name !== "string") continue;
    const kind = e.kind === "directory" ? "directory" : "file";
    let content: string | undefined;
    if (kind === "file" && typeof e.content === "string" && contentBudget > 0) {
      const clipped = e.content.slice(0, Math.min(MAX_CONTENT_PER_FILE, contentBudget));
      contentBudget -= clipped.length;
      content = clipped;
    }
    entries.push({
      path: e.path,
      name: e.name,
      kind,
      size: typeof e.size === "number" ? e.size : undefined,
      mimeType: typeof e.mimeType === "string" ? e.mimeType : undefined,
      content,
    });
  }

  return {
    rootName: o.rootName,
    indexedAt: typeof o.indexedAt === "string" ? o.indexedAt : new Date().toISOString(),
    entries,
  };
}

export function manifestSummary(manifest: DeviceManifest): string {
  const files = manifest.entries.filter((e) => e.kind === "file");
  const dirs = manifest.entries.filter((e) => e.kind === "directory");
  return `Root "${manifest.rootName}": ${files.length} files, ${dirs.length} folders (indexed ${manifest.indexedAt}).`;
}
