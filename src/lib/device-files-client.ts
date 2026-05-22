"use client";

import type { DeviceManifest, DeviceManifestEntry } from "@/lib/device-manifest";

const DB_NAME = "fighurai-device-v1";
const STORE = "handles";
function handleKeyForUser(userId: string): string {
  return `folder:${userId}`;
}

const LEGACY_HANDLE_KEY = "folder";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "html",
  "htm",
  "css",
  "xml",
  "yaml",
  "yml",
  "env",
  "log",
  "sh",
  "sql",
]);

const MAX_DEPTH = 4;
const MAX_FILES = 180;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 8_000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function idbSet(key: string, value: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbClearDeviceHandle(userId?: string | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (userId) tx.objectStore(STORE).delete(handleKeyForUser(userId));
      tx.objectStore(STORE).delete(LEGACY_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function saveDeviceDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  userId: string,
): Promise<void> {
  if (!userId) return;
  await idbSet(handleKeyForUser(userId), handle);
}

export async function loadDeviceDirectoryHandle(
  userId: string | null | undefined,
): Promise<FileSystemDirectoryHandle | null> {
  if (!userId) return null;
  try {
    const keyed = await idbGet(handleKeyForUser(userId));
    if (keyed) return keyed;
    return await idbGet(LEGACY_HANDLE_KEY);
  } catch {
    return null;
  }
}

type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
};

type DirHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as PermHandle;
  try {
    if (!h.queryPermission || !h.requestPermission) return true;
    const perm = await h.queryPermission({ mode: "read" });
    if (perm === "granted") return true;
    const req = await h.requestPermission({ mode: "read" });
    return req === "granted";
  } catch {
    return false;
  }
}

function isTextFile(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return TEXT_EXTENSIONS.has(ext);
}

async function readTextFile(
  handle: FileSystemFileHandle,
  path: string,
): Promise<{ content?: string; size?: number; mimeType?: string }> {
  const file = await handle.getFile();
  if (file.size > MAX_FILE_BYTES) return { size: file.size, mimeType: file.type };
  if (!isTextFile(file.name)) return { size: file.size, mimeType: file.type };
  const text = await file.text();
  return {
    size: file.size,
    mimeType: file.type || "text/plain",
    content: text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n[truncated]` : text,
  };
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  basePath: string,
  depth: number,
  entries: DeviceManifestEntry[],
  fileCount: { n: number },
): Promise<void> {
  if (depth > MAX_DEPTH || fileCount.n >= MAX_FILES) return;

  for await (const [name, handle] of (dir as DirHandle).entries()) {
    if (fileCount.n >= MAX_FILES) break;
    const path = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      entries.push({ path, name, kind: "directory" });
      if (depth < MAX_DEPTH) {
        await walkDirectory(handle as FileSystemDirectoryHandle, path, depth + 1, entries, fileCount);
      }
      continue;
    }
    fileCount.n += 1;
    const meta = await readTextFile(handle as FileSystemFileHandle, path);
    entries.push({
      path,
      name,
      kind: "file",
      size: meta.size,
      mimeType: meta.mimeType,
      content: meta.content,
    });
  }
}

/** Build manifest from persisted folder handle (for chat payload). */
export async function buildDeviceManifestForChat(
  userId: string | null | undefined,
): Promise<DeviceManifest | null> {
  if (!userId) return null;
  const handle = await loadDeviceDirectoryHandle(userId);
  if (!handle) return null;
  const ok = await ensureReadPermission(handle);
  if (!ok) return null;

  const entries: DeviceManifestEntry[] = [];
  await walkDirectory(handle, "", 0, entries, { n: 0 });

  return {
    rootName: handle.name,
    indexedAt: new Date().toISOString(),
    entries,
  };
}
