import { createHash, randomUUID } from "crypto";

import {
  deleteHostedAppIndex,
  writeHostedAppIndex,
} from "@/lib/apps/hosted-index";
import { findHtmlEntry, sanitizeAppFiles } from "@/lib/apps/serve";
import { getSiteUrl } from "@/lib/site-url";
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
  /** Public path slug: /a/{slug} */
  slug: string;
  files: ManagedAppFile[];
  conversationId?: string;
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

function publicAppUrl(slug: string): string {
  return `${getSiteUrl()}/a/${slug}`;
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

async function mutateApp(
  userId: string,
  appId: string,
  mutator: (app: ManagedApp) => ManagedApp,
): Promise<ManagedApp | null> {
  const store = await readStore(userId);
  const idx = store.apps.findIndex((a) => a.id === appId);
  if (idx < 0) return null;
  const next = mutator(store.apps[idx]!);
  store.apps[idx] = { ...next, updatedAt: new Date().toISOString() };
  await writeStore(userId, store);
  return store.apps[idx]!;
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
  const files = sanitizeAppFiles(input.files);
  if (!files.length) throw new Error("No valid files (check paths)");
  const app: ManagedApp = {
    id,
    name: input.name.trim().slice(0, 120) || "Untitled app",
    description: (input.description || "").trim().slice(0, 2000),
    status: "ready",
    slug: `${slugBase}-${hash}`,
    files,
    conversationId: input.conversationId,
    createdAt: now,
    updatedAt: now,
  };
  store.apps.unshift(app);
  store.apps = store.apps.slice(0, 50);
  await writeStore(userId, store);
  return app;
}

export async function updateManagedApp(
  userId: string,
  appId: string,
  patch: Partial<Pick<ManagedApp, "name" | "description" | "status" | "files" | "deployedUrl">>,
): Promise<ManagedApp | null> {
  return mutateApp(userId, appId, (prev) => {
    const next: ManagedApp = { ...prev, ...patch };
    if (patch.files) {
      next.files = sanitizeAppFiles(patch.files);
      next.checkpoint = {
        label: "auto-before-update",
        files: prev.files,
        savedAt: new Date().toISOString(),
      };
    }
    return next;
  });
}

export async function publishManagedApp(userId: string, appId: string): Promise<ManagedApp> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const app = await getManagedApp(userId, appId);
  if (!app) throw new Error("App not found");
  if (app.status === "archived") throw new Error("Archived apps cannot be published");
  if (!findHtmlEntry(app.files)) {
    throw new Error("Publish requires an HTML entry file (index.html preferred)");
  }

  await writeHostedAppIndex({
    userId,
    appId: app.id,
    slug: app.slug,
    publishedAt: new Date().toISOString(),
  });

  const updated = await mutateApp(userId, appId, (prev) => ({
    ...prev,
    status: "deployed",
    deployedUrl: publicAppUrl(prev.slug),
  }));
  if (!updated) throw new Error("App not found");
  return updated;
}

export async function unpublishManagedApp(userId: string, appId: string): Promise<ManagedApp> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const app = await getManagedApp(userId, appId);
  if (!app) throw new Error("App not found");

  await deleteHostedAppIndex(app.slug);

  const updated = await mutateApp(userId, appId, (prev) => {
    const { deployedUrl: _drop, ...rest } = prev;
    return {
      ...rest,
      status: prev.status === "archived" ? "archived" : "ready",
    };
  });
  if (!updated) throw new Error("App not found");
  return updated;
}

export async function archiveManagedApp(userId: string, appId: string): Promise<boolean> {
  const app = await getManagedApp(userId, appId);
  if (!app) return false;
  if (app.status === "deployed" || app.deployedUrl) {
    try {
      await deleteHostedAppIndex(app.slug);
    } catch {
      /* continue */
    }
  }
  const updated = await mutateApp(userId, appId, (prev) => {
    const { deployedUrl: _drop, ...rest } = prev;
    return { ...rest, status: "archived" };
  });
  return Boolean(updated);
}
