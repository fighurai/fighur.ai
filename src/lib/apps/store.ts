import { createHash, randomUUID } from "crypto";

import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "apps.json";

export type ManagedAppStatus = "draft" | "ready" | "deployed" | "archived";

export type ManagedAppFile = {
  path: string;
  content: string;
};

export type ManagedApp = {
  id: string;
  name: string;
  description: string;
  status: ManagedAppStatus;
  /** Subdomain slug for future *.fighur.app hosting */
  slug: string;
  files: ManagedAppFile[];
  /** Optional conversation id that created this app */
  conversationId?: string;
  /** Future: live URL after deploy */
  deployedUrl?: string;
  createdAt: string;
  updatedAt: string;
  checkpoint?: {
    label: string;
    files: ManagedAppFile[];
    savedAt: string;
  };
};

type AppStore = {
  apps: ManagedApp[];
  updatedAt: string;
};

function emptyStore(): AppStore {
  return { apps: [], updatedAt: new Date().toISOString() };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "app";
}

async function readStore(userId: string): Promise<AppStore> {
  if (!isSafeUserId(userId)) return emptyStore();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as AppStore;
    if (!Array.isArray(parsed.apps)) return emptyStore();
    return {
      apps: parsed.apps,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(userId: string, store: AppStore): Promise<AppStore> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}

export async function listManagedApps(userId: string): Promise<ManagedApp[]> {
  const store = await readStore(userId);
  return store.apps.filter((a) => a.status !== "archived");
}

export async function getManagedApp(userId: string, appId: string): Promise<ManagedApp | null> {
  const store = await readStore(userId);
  return store.apps.find((a) => a.id === appId) ?? null;
}

export async function createManagedApp(
  userId: string,
  input: {
    name: string;
    description?: string;
    files: ManagedAppFile[];
    conversationId?: string;
  },
): Promise<ManagedApp> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const store = await readStore(userId);
  const id = randomUUID();
  const slugBase = slugify(input.name);
  const hash = createHash("sha256").update(id).digest("hex").slice(0, 6);
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    name: input.name.trim().slice(0, 120) || "Untitled app",
    description: (input.description || "").trim().slice(0, 2000),
    status: "ready",
    slug: `${slugBase}-${hash}`,
    files: input.files.slice(0, 40).map((f) => ({
      path: f.path.slice(0, 200),
      content: f.content.slice(0, 200_000),
    })),
    conversationId: input.conversationId,
    createdAt: now,
    updatedAt: now,
  };
  store.apps.unshift(app);
  // Cap stored apps
  store.apps = store.apps.slice(0, 50);
  await writeStore(userId, store);
  return app;
}

export async function updateManagedApp(
  userId: string,
  appId: string,
  patch: Partial<Pick<ManagedApp, "name" | "description" | "status" | "files" | "deployedUrl">>,
): Promise<ManagedApp | null> {
  const store = await readStore(userId);
  const idx = store.apps.findIndex((a) => a.id === appId);
  if (idx < 0) return null;
  const prev = store.apps[idx]!;
  const next: ManagedApp = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.files) {
    next.checkpoint = {
      label: "auto-before-update",
      files: prev.files,
      savedAt: new Date().toISOString(),
    };
  }
  store.apps[idx] = next;
  await writeStore(userId, store);
  return next;
}

export async function archiveManagedApp(userId: string, appId: string): Promise<boolean> {
  const updated = await updateManagedApp(userId, appId, { status: "archived" });
  return Boolean(updated);
}
