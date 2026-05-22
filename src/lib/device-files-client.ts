"use client";

import type { DeviceManifest, DeviceManifestEntry } from "@/lib/device-manifest";

const DB_NAME = "fighurai-device-v1";
const STORE = "handles";
const DB_VERSION = 2;

function handleKeyForUser(userId: string): string {
  return `folder:${userId}`;
}

function manifestKeyForUser(userId: string): string {
  return `manifest:${userId}`;
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
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsNativeDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Safari / Firefox: `<input webkitdirectory>` folder selection. */
export function supportsWebkitDirectoryPicker(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

export function supportsDeviceFolderPicker(): boolean {
  return supportsNativeDirectoryPicker() || supportsWebkitDirectoryPicker();
}

function pickFolderViaWebkitInput(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.multiple = true;
    input.style.cssText = "position:fixed;left:-9999px;opacity:0;";
    const cleanup = () => input.remove();

    input.addEventListener("change", () => {
      const files = input.files;
      cleanup();
      resolve(files && files.length > 0 ? files : null);
    });

    document.body.appendChild(input);
    input.click();
  });
}

function isTextFile(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return TEXT_EXTENSIONS.has(ext);
}

async function readTextFromFile(file: File): Promise<string | undefined> {
  if (file.size > MAX_FILE_BYTES || !isTextFile(file.name)) return undefined;
  const text = await file.text();
  return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n[truncated]` : text;
}

/** Build manifest from Safari-style folder upload (FileList + webkitRelativePath). */
export async function buildManifestFromFileList(files: FileList): Promise<DeviceManifest> {
  const entries: DeviceManifestEntry[] = [];
  const dirPaths = new Set<string>();
  let rootName = "Folder";
  let fileCount = 0;

  for (let i = 0; i < files.length && fileCount < MAX_FILES; i++) {
    const file = files[i];
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath?.replace(/\\/g, "/") ||
      file.name;
    const segments = rel.split("/").filter(Boolean);
    if (segments.length > 0 && rootName === "Folder") {
      rootName = segments[0];
    }

    for (let d = 1; d < segments.length; d++) {
      const dirPath = segments.slice(0, d).join("/");
      if (!dirPaths.has(dirPath) && dirPath.split("/").length <= MAX_DEPTH) {
        dirPaths.add(dirPath);
        entries.push({
          path: dirPath,
          name: segments[d - 1],
          kind: "directory",
        });
      }
    }

    if (segments.length === 0) continue;
    fileCount += 1;
    const path = segments.join("/");
    const content = await readTextFromFile(file);
    entries.push({
      path,
      name: segments[segments.length - 1] ?? file.name,
      kind: "file",
      size: file.size,
      mimeType: file.type || undefined,
      content,
    });
  }

  return {
    rootName,
    indexedAt: new Date().toISOString(),
    entries: entries.slice(0, MAX_FILES + 200),
  };
}

export async function saveDeviceManifestSnapshot(
  userId: string,
  manifest: DeviceManifest,
): Promise<void> {
  if (!userId) return;
  await idbSet(manifestKeyForUser(userId), manifest);
}

export async function loadDeviceManifestSnapshot(
  userId: string | null | undefined,
): Promise<DeviceManifest | null> {
  if (!userId) return null;
  const m = await idbGet<DeviceManifest>(manifestKeyForUser(userId));
  if (m?.entries && m.rootName) return m;
  return null;
}

export async function idbClearDeviceHandle(userId?: string | null): Promise<void> {
  try {
    if (userId) {
      await idbDelete(handleKeyForUser(userId));
      await idbDelete(manifestKeyForUser(userId));
    }
    await idbDelete(LEGACY_HANDLE_KEY);
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
  await idbDelete(manifestKeyForUser(userId));
}

export async function loadDeviceDirectoryHandle(
  userId: string | null | undefined,
): Promise<FileSystemDirectoryHandle | null> {
  if (!userId) return null;
  try {
    const keyed = await idbGet<FileSystemDirectoryHandle>(handleKeyForUser(userId));
    if (keyed) return keyed;
    return await idbGet<FileSystemDirectoryHandle>(LEGACY_HANDLE_KEY);
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

async function readTextFileHandle(
  handle: FileSystemFileHandle,
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
    const meta = await readTextFileHandle(handle as FileSystemFileHandle);
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

export type ConnectDeviceFolderResult =
  | { ok: true; rootName: string; mode: "native" | "webkit" }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

/**
 * Connect a device folder (Chrome/Edge native picker or Safari webkitdirectory snapshot).
 */
export async function connectDeviceFolder(userId: string): Promise<ConnectDeviceFolderResult> {
  if (!userId) return { ok: false, error: "Sign in required." };

  if (supportsNativeDirectoryPicker()) {
    try {
      const w = window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      };
      const handle = await w.showDirectoryPicker!();
      await saveDeviceDirectoryHandle(handle, userId);
      return { ok: true, rootName: handle.name, mode: "native" };
    } catch (e) {
      if ((e as Error).name === "AbortError") return { ok: false, cancelled: true };
      if (supportsWebkitDirectoryPicker()) {
        /* fall through to webkit */
      } else {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not open folder.",
        };
      }
    }
  }

  if (!supportsWebkitDirectoryPicker()) {
    return {
      ok: false,
      error: "This browser cannot pick folders. Try Safari or Chrome on desktop.",
    };
  }

  try {
    const files = await pickFolderViaWebkitInput();
    if (!files) return { ok: false, cancelled: true };
    const manifest = await buildManifestFromFileList(files);
    await idbDelete(handleKeyForUser(userId));
    await saveDeviceManifestSnapshot(userId, manifest);
    return { ok: true, rootName: manifest.rootName, mode: "webkit" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not read folder.",
    };
  }
}

/** Build manifest for chat (live handle walk or Safari snapshot). */
export async function buildDeviceManifestForChat(
  userId: string | null | undefined,
): Promise<DeviceManifest | null> {
  if (!userId) return null;

  const handle = await loadDeviceDirectoryHandle(userId);
  if (handle) {
    const ok = await ensureReadPermission(handle);
    if (ok) {
      const entries: DeviceManifestEntry[] = [];
      await walkDirectory(handle, "", 0, entries, { n: 0 });
      return {
        rootName: handle.name,
        indexedAt: new Date().toISOString(),
        entries,
      };
    }
  }

  const snapshot = await loadDeviceManifestSnapshot(userId);
  if (snapshot) {
    return { ...snapshot, indexedAt: new Date().toISOString() };
  }

  return null;
}
