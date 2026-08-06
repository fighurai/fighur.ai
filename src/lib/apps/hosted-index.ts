import {
  deleteGlobalUserFile,
  readGlobalUserFile,
  writeGlobalUserFile,
} from "@/lib/user-file-storage";

export type HostedAppIndexEntry = {
  userId: string;
  appId: string;
  slug: string;
  publishedAt: string;
};

function indexPath(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  if (!safe) throw new Error("Invalid slug");
  return `hosted-apps/${safe}.json`;
}

export function isSafeAppSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{6}$/.test(slug) || /^[a-z0-9][a-z0-9_-]{0,47}$/.test(slug);
}

export async function readHostedAppIndex(slug: string): Promise<HostedAppIndexEntry | null> {
  if (!isSafeAppSlug(slug)) return null;
  try {
    const raw = await readGlobalUserFile(indexPath(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostedAppIndexEntry>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.appId !== "string" ||
      typeof parsed.slug !== "string"
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      appId: parsed.appId,
      slug: parsed.slug,
      publishedAt:
        typeof parsed.publishedAt === "string" ? parsed.publishedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeHostedAppIndex(entry: HostedAppIndexEntry): Promise<void> {
  if (!isSafeAppSlug(entry.slug)) throw new Error("Invalid slug");
  const existing = await readHostedAppIndex(entry.slug);
  if (existing && (existing.userId !== entry.userId || existing.appId !== entry.appId)) {
    throw new Error("Slug already published by another app");
  }
  await writeGlobalUserFile(
    indexPath(entry.slug),
    JSON.stringify({ ...entry, publishedAt: entry.publishedAt || new Date().toISOString() }),
  );
}

export async function deleteHostedAppIndex(slug: string): Promise<void> {
  if (!isSafeAppSlug(slug)) return;
  await deleteGlobalUserFile(indexPath(slug));
}
