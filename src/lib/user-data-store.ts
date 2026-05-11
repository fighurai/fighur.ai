import { createHash, randomUUID } from "crypto";
import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeUserId(id: string): boolean {
  return UUID_RE.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

function dataRoot(): string {
  const fromEnv = process.env.SMILE_USER_DATA_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : path.join(process.cwd(), ".data");
}

export function getUsersRoot(): string {
  return path.join(dataRoot(), "users");
}

function byEmailDir(): string {
  return path.join(getUsersRoot(), "_by-email");
}

function emailKey(email: string): string {
  const norm = email.trim().toLowerCase();
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

export function userDir(userId: string): string {
  if (!isSafeUserId(userId)) throw new Error("Invalid user id");
  return path.join(getUsersRoot(), userId);
}

export type UserProfile = {
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
};

async function ensureDirSecure(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await chmod(dir, 0o700);
  } catch {
    /* chmod may fail on some FS */
  }
}

/** Create or resolve a user folder keyed by email (hashed index). */
export async function ensureUser(emailRaw: string, name?: string): Promise<{ userId: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@") || email.length > 320) {
    throw new Error("Invalid email");
  }

  await ensureDirSecure(getUsersRoot());
  await ensureDirSecure(byEmailDir());

  const key = emailKey(email);
  const indexPath = path.join(byEmailDir(), `${key}.json`);

  let userId: string | null = null;
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as { userId?: unknown };
    if (typeof parsed.userId === "string" && isSafeUserId(parsed.userId)) {
      userId = parsed.userId;
    }
  } catch {
    /* no index yet */
  }
  if (!userId) {
    userId = randomUUID();
    await writeFile(indexPath, JSON.stringify({ userId }, null, 0), { mode: 0o600 });
  }

  const dir = userDir(userId);
  await ensureDirSecure(dir);

  const profilePath = path.join(dir, "profile.json");
  const now = new Date().toISOString();
  let profile: UserProfile;
  try {
    const existing = JSON.parse(await readFile(profilePath, "utf8")) as UserProfile;
    profile = {
      ...existing,
      email,
      name: name?.trim() || existing.name,
      updatedAt: now,
    };
  } catch {
    profile = {
      userId,
      email,
      name: name?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  await writeFile(profilePath, JSON.stringify(profile, null, 0), { mode: 0o600 });
  return { userId };
}

export async function readUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSafeUserId(userId)) return null;
  try {
    const raw = await readFile(path.join(userDir(userId), "profile.json"), "utf8");
    const p = JSON.parse(raw) as UserProfile;
    if (p.userId !== userId || typeof p.email !== "string") return null;
    return p;
  } catch {
    return null;
  }
}
