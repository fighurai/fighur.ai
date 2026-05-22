import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import { del, get, put } from "@vercel/blob";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSafeUserId(id: string): boolean {
  return UUID_RE.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

function blobToken(): string | null {
  const t =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.SMILE_BLOB_READ_WRITE_TOKEN?.trim() ||
    "";
  return t.length > 0 ? t : null;
}

/** True when account data is stored in Vercel Blob (survives deploys / regions). */
export function usesBlobUserStorage(): boolean {
  return blobToken() !== null;
}

function dataRoot(): string {
  const fromEnv = process.env.SMILE_USER_DATA_DIR?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.VERCEL) return "/tmp/smile-ai-data";
  return path.join(process.cwd(), ".data");
}

function fsPathForUser(userId: string, relativePath: string): string {
  if (!isSafeUserId(userId)) throw new Error("Invalid user id");
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return path.join(dataRoot(), "users", userId, safe);
}

function fsPathGlobal(relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return path.join(dataRoot(), "users", safe);
}

function blobPathForUser(userId: string, relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return `smile-ai/users/${userId}/${safe}`;
}

function blobPathGlobal(relativePath: string): string {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  return `smile-ai/${safe}`;
}

async function readFs(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function writeFs(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, content, { mode: 0o600 });
}

async function deleteFs(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    /* missing */
  }
}

async function readBlob(blobPath: string): Promise<string | null> {
  const token = blobToken();
  if (!token) return null;
  try {
    const result = await get(blobPath, { access: "private", token, useCache: false });
    if (!result?.stream) return null;
    return await new Response(result.stream).text();
  } catch {
    return null;
  }
}

async function writeBlob(blobPath: string, content: string): Promise<void> {
  const token = blobToken();
  if (!token) throw new Error("Blob storage not configured");
  await put(blobPath, content, {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function deleteBlob(blobPath: string): Promise<void> {
  const token = blobToken();
  if (!token) return;
  try {
    await del(blobPath, { token });
  } catch {
    /* missing */
  }
}

/** Read a file under users/<userId>/… */
export async function readUserFile(userId: string, relativePath: string): Promise<string | null> {
  if (usesBlobUserStorage()) {
    return readBlob(blobPathForUser(userId, relativePath));
  }
  return readFs(fsPathForUser(userId, relativePath));
}

/** Write a file under users/<userId>/… */
export async function writeUserFile(
  userId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (usesBlobUserStorage()) {
    await writeBlob(blobPathForUser(userId, relativePath), content);
    return;
  }
  await writeFs(fsPathForUser(userId, relativePath), content);
}

/** Delete a file under users/<userId>/… */
export async function deleteUserFile(userId: string, relativePath: string): Promise<void> {
  if (usesBlobUserStorage()) {
    await deleteBlob(blobPathForUser(userId, relativePath));
    return;
  }
  await deleteFs(fsPathForUser(userId, relativePath));
}

/** Read global index files (e.g. _by-email/…). */
export async function readGlobalUserFile(relativePath: string): Promise<string | null> {
  if (usesBlobUserStorage()) {
    return readBlob(blobPathGlobal(`users/${relativePath}`));
  }
  return readFs(fsPathGlobal(relativePath));
}

/** Write global index files. */
export async function writeGlobalUserFile(relativePath: string, content: string): Promise<void> {
  if (usesBlobUserStorage()) {
    await writeBlob(blobPathGlobal(`users/${relativePath}`), content);
    return;
  }
  await writeFs(fsPathGlobal(relativePath), content);
}
