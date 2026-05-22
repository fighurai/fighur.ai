"use client";

import {
  loadDeviceDirectoryHandle,
  supportsNativeDirectoryPicker,
} from "@/lib/device-files-client";

export type DeviceFileOp =
  | { op: "move"; from: string; to: string }
  | { op: "rename"; path: string; newName: string }
  | { op: "mkdir"; path: string };

export type DeviceOpsPayload = {
  ops: DeviceFileOp[];
  summary?: string;
};

const MAX_OPS = 40;

type DirHandle = FileSystemDirectoryHandle & {
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileSystemDirectoryHandle>;
  getFileHandle: (name: string) => Promise<FileSystemFileHandle>;
};

type FileHandle = FileSystemFileHandle & {
  move: (
    destination: FileSystemDirectoryHandle,
    newName?: string,
  ) => Promise<FileSystemFileHandle>;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
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

/** Parse ```device-ops` JSON block from assistant text. */
export function parseDeviceOpsFromText(text: string): DeviceOpsPayload | null {
  const fence = /```device-ops\s*\r?\n([\s\S]*?)```/i.exec(text);
  if (!fence) return null;
  try {
    const json = JSON.parse(fence[1].trim()) as DeviceOpsPayload;
    if (!Array.isArray(json.ops)) return null;
    const ops = json.ops.slice(0, MAX_OPS).filter((o) => {
      if (!o || typeof o !== "object") return false;
      const op = (o as DeviceFileOp).op;
      if (op === "move") {
        return typeof (o as { from?: string }).from === "string" && typeof (o as { to?: string }).to === "string";
      }
      if (op === "rename") {
        return (
          typeof (o as { path?: string }).path === "string" &&
          typeof (o as { newName?: string }).newName === "string"
        );
      }
      if (op === "mkdir") return typeof (o as { path?: string }).path === "string";
      return false;
    }) as DeviceFileOp[];
    return ops.length ? { ops, summary: json.summary } : null;
  } catch {
    return null;
  }
}

export async function canApplyDeviceFileOps(userId: string): Promise<boolean> {
  if (!supportsNativeDirectoryPicker()) return false;
  const handle = await loadDeviceDirectoryHandle(userId);
  if (!handle) return false;
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (!h.queryPermission) return false;
  try {
    const p = await h.queryPermission({ mode: "readwrite" });
    return p === "granted";
  } catch {
    return false;
  }
}

async function applyOneOp(root: FileSystemDirectoryHandle, op: DeviceFileOp): Promise<void> {
  const r = root as DirHandle;
  if (op.op === "mkdir") {
    const parts = normalizePath(op.path).split("/").filter(Boolean);
    await resolveDir(r, parts, true);
    return;
  }
  if (op.op === "rename") {
    const { dirs, name } = splitPath(op.path);
    const parent = await resolveDir(r, dirs, false);
    const file = (await (parent as DirHandle).getFileHandle(name)) as FileHandle;
    await file.move(parent as FileSystemDirectoryHandle, op.newName);
    return;
  }
  if (op.op === "move") {
    const from = splitPath(op.from);
    const to = splitPath(op.to);
    const srcDir = await resolveDir(r, from.dirs, false);
    const file = (await (srcDir as DirHandle).getFileHandle(from.name)) as FileHandle;
    const destDir = await resolveDir(r, to.dirs, true);
    await file.move(destDir, to.name || from.name);
  }
}

export type ApplyDeviceOpsResult = {
  applied: number;
  errors: string[];
};

/** Apply file moves/renames/mkdirs on the connected folder (Chrome/Edge + write permission). */
export async function applyDeviceFileOps(
  userId: string,
  payload: DeviceOpsPayload,
): Promise<ApplyDeviceOpsResult> {
  const handle = await loadDeviceDirectoryHandle(userId);
  if (!handle) {
    return { applied: 0, errors: ["No live folder connection. Reconnect in Settings with Chrome."] };
  }
  const writable = await canApplyDeviceFileOps(userId);
  if (!writable) {
    return {
      applied: 0,
      errors: ["Write access not granted. Disconnect the folder and connect again (allow edit access)."],
    };
  }

  const errors: string[] = [];
  let applied = 0;
  for (const op of payload.ops.slice(0, MAX_OPS)) {
    try {
      await applyOneOp(handle, op);
      applied += 1;
    } catch (e) {
      const label =
        op.op === "move"
          ? `${op.from} → ${op.to}`
          : op.op === "rename"
            ? `${op.path} → ${op.newName}`
            : op.path;
      errors.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return { applied, errors };
}

