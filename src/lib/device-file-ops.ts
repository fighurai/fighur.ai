"use client";

import {
  ensureWritePermission,
  getCachedDeviceDirectoryHandle,
  loadDeviceDirectoryHandle,
  loadDeviceManifestSnapshot,
  supportsNativeDirectoryPicker,
} from "@/lib/device-files-client";
import { isSafariBrowser } from "@/lib/device-ops-safari";

export type { DeviceFileOp, DeviceOpsPayload } from "@/lib/device-ops-parse";
import type { DeviceFileOp, DeviceOpsPayload } from "@/lib/device-ops-parse";

const MAX_OPS = 40;

type DirHandle = FileSystemDirectoryHandle & {
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileSystemDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandle>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
};

type MoveableFile = FileSystemFileHandle & {
  move?: (
    destination: FileSystemDirectoryHandle,
    newName?: string,
  ) => Promise<FileSystemFileHandle>;
  createWritable?: () => Promise<FileSystemWritableFileStream>;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

/** Model often prefixes paths with the folder name; strip to match picker root. */
export function stripRootPrefix(path: string, rootName: string): string {
  const n = normalizePath(path);
  const root = normalizePath(rootName);
  if (!root) return n;
  if (n === root) return "";
  if (n.startsWith(`${root}/`)) return n.slice(root.length + 1);
  return n;
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = normalizePath(path).split("/").filter(Boolean);
  if (parts.length === 0) return { dirs: [], name: "" };
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  dirParts: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = root as DirHandle;
  for (const part of dirParts) {
    dir = (await dir.getDirectoryHandle(part, { create })) as DirHandle;
  }
  return dir;
}

async function moveFileEntry(
  srcDir: FileSystemDirectoryHandle,
  fileName: string,
  destDir: FileSystemDirectoryHandle,
  destName: string,
): Promise<void> {
  const src = srcDir as DirHandle;
  const dest = destDir as DirHandle;
  const fileHandle = (await src.getFileHandle(fileName)) as MoveableFile;

  if (typeof fileHandle.move === "function") {
    await fileHandle.move(destDir, destName);
    return;
  }

  const blob = await (await fileHandle.getFile()).arrayBuffer();
  const outHandle = (await dest.getFileHandle(destName, { create: true })) as MoveableFile;
  if (!outHandle.createWritable) {
    throw new Error("Browser cannot write files in this folder");
  }
  const writable = await outHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  if (src.removeEntry) {
    await src.removeEntry(fileName);
  }
}

export {
  deviceOpsFromToolInput,
  formatDeviceOpsFence,
  parseDeviceOpsFromText,
} from "@/lib/device-ops-parse";

export type DeviceWriteAccess =
  | { ok: true; handle: FileSystemDirectoryHandle; rootName: string }
  | { ok: false; error: string; needsReconnect: boolean };

/**
 * Invoke synchronously inside the Apply button click handler (user gesture).
 * Await the returned promise later — only the call must happen during the click.
 */
export function beginWritePermissionRequest(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> | null {
  const h = handle as PermHandle;
  if (!h.requestPermission) return null;
  return h.requestPermission({ mode: "readwrite" });
}

async function confirmWriteAccess(
  handle: FileSystemDirectoryHandle,
  permissionPromise: Promise<PermissionState> | null,
): Promise<DeviceWriteAccess> {
  if (permissionPromise) {
    const perm = await permissionPromise;
    if (perm !== "granted") {
      return {
        ok: false,
        needsReconnect: true,
        error:
          'Write access was blocked. Click "Reconnect folder" below, pick the same folder, and choose Allow / Edit when the browser asks.',
      };
    }
  } else {
    const h = handle as PermHandle;
    if (h.requestPermission) {
      const current = await h.queryPermission?.({ mode: "readwrite" });
      if (current !== "granted") {
        const req = await h.requestPermission({ mode: "readwrite" });
        if (req !== "granted") {
          return {
            ok: false,
            needsReconnect: true,
            error:
              'Write access was blocked. Click "Reconnect folder" below, pick the same folder, and choose Allow / Edit when the browser asks.',
          };
        }
      }
    } else if (!(await ensureWritePermission(handle))) {
      return {
        ok: false,
        needsReconnect: true,
        error:
          "Could not confirm write permission for this folder. Reconnect the folder and allow edit access.",
      };
    }
  }

  return { ok: true, handle, rootName: handle.name };
}

/** Use from Apply click: pass handle + permission promise started in the same click event. */
export async function prepareDeviceWriteAccessFromClick(
  userId: string,
  cachedHandle: FileSystemDirectoryHandle | null,
  permissionPromise: Promise<PermissionState> | null,
): Promise<DeviceWriteAccess> {
  if (!supportsNativeDirectoryPicker()) {
    const snapshot = await loadDeviceManifestSnapshot(userId);
    if (isSafariBrowser() || snapshot) {
      return {
        ok: false,
        needsReconnect: false,
        error:
          "Safari cannot apply moves in the browser. Use Download for Safari in the popup — it uses Finder to pick your folder, then organizes files.",
      };
    }
    return {
      ok: false,
      needsReconnect: true,
      error: "Use Chrome or Edge on desktop to apply file changes.",
    };
  }

  const handle = cachedHandle ?? (await loadDeviceDirectoryHandle(userId));
  if (!handle) {
    const snapshot = await loadDeviceManifestSnapshot(userId);
    return {
      ok: false,
      needsReconnect: true,
      error: snapshot
        ? "This folder is a read-only snapshot (Safari). Disconnect it in Settings, then reconnect in Chrome or Edge and allow edit access."
        : 'No folder linked. Click "Reconnect folder" below or open Settings → This device · folder.',
    };
  }

  return confirmWriteAccess(handle, permissionPromise);
}

export async function prepareDeviceWriteAccess(userId: string): Promise<DeviceWriteAccess> {
  const cached = getCachedDeviceDirectoryHandle(userId);
  return prepareDeviceWriteAccessFromClick(userId, cached, null);
}

/** True when a live folder handle exists (Chrome/Edge picker). */
export async function canApplyDeviceFileOps(userId: string): Promise<boolean> {
  if (!supportsNativeDirectoryPicker()) return false;
  return Boolean(await loadDeviceDirectoryHandle(userId));
}

function normalizeOpPaths(op: DeviceFileOp, rootName: string): DeviceFileOp {
  if (op.op === "move") {
    return {
      op: "move",
      from: stripRootPrefix(op.from, rootName),
      to: stripRootPrefix(op.to, rootName),
    };
  }
  if (op.op === "rename") {
    return { ...op, path: stripRootPrefix(op.path, rootName) };
  }
  return { ...op, path: stripRootPrefix(op.path, rootName) };
}

async function applyOneOp(
  root: FileSystemDirectoryHandle,
  rootName: string,
  op: DeviceFileOp,
): Promise<void> {
  const normalized = normalizeOpPaths(op, rootName);
  const r = root as DirHandle;

  if (normalized.op === "mkdir") {
    const parts = normalizePath(normalized.path).split("/").filter(Boolean);
    await resolveDir(r, parts, true);
    return;
  }
  if (normalized.op === "rename") {
    const { dirs, name } = splitPath(normalized.path);
    if (!name) throw new Error("Invalid path");
    const parent = await resolveDir(r, dirs, false);
    await moveFileEntry(parent, name, parent, normalized.newName);
    return;
  }
  if (normalized.op === "move") {
    const from = splitPath(normalized.from);
    const to = splitPath(normalized.to);
    if (!from.name) throw new Error("Invalid from path");
    const srcDir = await resolveDir(r, from.dirs, false);
    const destDir = await resolveDir(r, to.dirs, true);
    await moveFileEntry(srcDir, from.name, destDir, to.name || from.name);
  }
}

export type ApplyDeviceOpsResult = {
  applied: number;
  errors: string[];
};

/** Apply ops using an already-authorized handle (from prepareDeviceWriteAccess). */
export async function applyDeviceFileOpsWithHandle(
  handle: FileSystemDirectoryHandle,
  payload: DeviceOpsPayload,
): Promise<ApplyDeviceOpsResult> {
  const rootName = handle.name;
  const errors: string[] = [];
  let applied = 0;

  for (const op of payload.ops.slice(0, MAX_OPS)) {
    try {
      await applyOneOp(handle, rootName, op);
      applied += 1;
    } catch (e) {
      const label =
        op.op === "move"
          ? `${op.from} → ${op.to}`
          : op.op === "rename"
            ? `${op.path} → ${op.newName}`
            : op.path;
      const msg = e instanceof Error ? e.message : "failed";
      errors.push(`${label}: ${msg}`);
    }
  }

  return { applied, errors };
}

export async function applyDeviceFileOps(
  userId: string,
  payload: DeviceOpsPayload,
): Promise<ApplyDeviceOpsResult> {
  const prep = await prepareDeviceWriteAccess(userId);
  if (!prep.ok) {
    return { applied: 0, errors: [prep.error] };
  }
  return applyDeviceFileOpsWithHandle(prep.handle, payload);
}
