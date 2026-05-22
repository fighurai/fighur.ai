import { createHash, randomUUID } from "crypto";
import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { Permission } from "@/lib/rbac";
import { normalizeRoles, type Role } from "@/lib/rbac";

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

export type AuthProvider = "email" | "google" | "microsoft";

export type UserProfile = {
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
  /** Private data environment id (isolated disk prefix). */
  environmentId: string;
  roles: Role[];
  permissions?: Permission[];
  authProvider: AuthProvider;
  passwordHash?: string;
  ssoSubjects?: { google?: string; microsoft?: string };
  emailVerified?: boolean;
};

async function ensureDirSecure(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await chmod(dir, 0o700);
  } catch {
    /* chmod may fail on some FS */
  }
}

export type EnsureUserOptions = {
  name?: string;
  passwordHash?: string;
  authProvider?: AuthProvider;
  roles?: Role[];
  ssoSubject?: { provider: "google" | "microsoft"; subject: string };
  emailVerified?: boolean;
};

/** Create or resolve a user folder keyed by email (hashed index). */
export async function ensureUser(
  emailRaw: string,
  nameOrOpts?: string | EnsureUserOptions,
): Promise<{ userId: string }> {
  const opts: EnsureUserOptions =
    typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts ?? {});
  const name = opts.name;
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
    const ssoSubjects = { ...existing.ssoSubjects };
    if (opts.ssoSubject?.provider === "google") ssoSubjects.google = opts.ssoSubject.subject;
    if (opts.ssoSubject?.provider === "microsoft") ssoSubjects.microsoft = opts.ssoSubject.subject;

    profile = {
      ...existing,
      email,
      name: name?.trim() || existing.name,
      updatedAt: now,
      environmentId: existing.environmentId || userId,
      roles: normalizeRoles(existing.roles?.length ? existing.roles : opts.roles),
      authProvider: existing.authProvider || opts.authProvider || "email",
      passwordHash: opts.passwordHash ?? existing.passwordHash,
      ssoSubjects: Object.keys(ssoSubjects).length ? ssoSubjects : existing.ssoSubjects,
      emailVerified: opts.emailVerified ?? existing.emailVerified,
    };
  } catch {
    profile = {
      userId,
      email,
      name: name?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      environmentId: userId,
      roles: normalizeRoles(opts.roles ?? ["user"]),
      authProvider: opts.authProvider ?? "email",
      passwordHash: opts.passwordHash,
      ssoSubjects: opts.ssoSubject
        ? { [opts.ssoSubject.provider]: opts.ssoSubject.subject }
        : undefined,
      emailVerified: opts.emailVerified,
    };
  }

  await writeFile(profilePath, JSON.stringify(profile, null, 0), { mode: 0o600 });
  await mkdir(path.join(dir, "conversations"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(dir, "audit"), { recursive: true, mode: 0o700 });
  return { userId };
}

export async function readUserByEmail(emailRaw: string): Promise<UserProfile | null> {
  const email = emailRaw.trim().toLowerCase();
  const key = emailKey(email);
  try {
    const raw = await readFile(path.join(byEmailDir(), `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as { userId?: unknown };
    if (typeof parsed.userId === "string" && isSafeUserId(parsed.userId)) {
      return readUserProfile(parsed.userId);
    }
  } catch {
    /* not found */
  }
  return null;
}

export async function readUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSafeUserId(userId)) return null;
  try {
    const raw = await readFile(path.join(userDir(userId), "profile.json"), "utf8");
    const p = JSON.parse(raw) as Partial<UserProfile>;
    if (p.userId !== userId || typeof p.email !== "string") return null;
    return {
      userId: p.userId,
      email: p.email,
      name: p.name,
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      environmentId: p.environmentId ?? p.userId,
      roles: normalizeRoles(p.roles),
      permissions: p.permissions,
      authProvider: p.authProvider ?? "email",
      passwordHash: p.passwordHash,
      ssoSubjects: p.ssoSubjects,
      emailVerified: p.emailVerified,
    };
  } catch {
    return null;
  }
}
