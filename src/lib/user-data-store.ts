import { createHash } from "crypto";
import { chmod, mkdir } from "fs/promises";
import path from "path";

import type { Permission } from "@/lib/rbac";
import { normalizeRoles, type Role } from "@/lib/rbac";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";
import {
  readGlobalUserFile,
  readUserFile,
  usesBlobUserStorage,
  writeGlobalUserFile,
  writeUserFile,
} from "@/lib/user-file-storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeUserId(id: string): boolean {
  return UUID_RE.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

function dataRoot(): string {
  const fromEnv = process.env.SMILE_USER_DATA_DIR?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  // Vercel lambdas only allow writes under /tmp (project dir is read-only).
  if (process.env.VERCEL) return "/tmp/smile-ai-data";
  return path.join(process.cwd(), ".data");
}

/** Stable user id when disk index is unavailable (same email → same id). */
export function userIdFromEmail(emailRaw: string): string {
  const email = emailRaw.trim().toLowerCase();
  const hash = createHash("sha256").update(`smile-user-v1:${email}`, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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

export type UserPlan = "free" | "pro";

export function normalizePlan(raw: unknown): UserPlan {
  return raw === "pro" ? "pro" : "free";
}

function planFromEmail(email: string): UserPlan {
  if (isComplimentaryProEmail(email)) return "pro";
  const list = process.env.SMILE_PRO_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) ?? [];
  return list.includes(email.trim().toLowerCase()) ? "pro" : "free";
}

/** Built-in owner/admin accounts — Pro without Stripe. */
export function isComplimentaryProEmail(emailRaw: string): boolean {
  const email = emailRaw.trim().toLowerCase();
  if (email === "hello@fighurai.com") return true;
  const list = process.env.SMILE_PRO_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) ?? [];
  return list.includes(email);
}

export function complimentaryRolesForEmail(emailRaw: string): Role[] | null {
  if (emailRaw.trim().toLowerCase() === "hello@fighurai.com") return ["admin", "user"];
  return null;
}

/** Persist Pro/admin entitlements for complimentary accounts (e.g. on sign-in). */
export async function ensureComplimentaryEntitlements(
  userId: string,
  emailRaw: string,
): Promise<UserProfile | null> {
  const profile = await readUserProfile(userId);
  if (!profile) return null;

  const email = emailRaw.trim().toLowerCase();
  const wantPro = isComplimentaryProEmail(email);
  const wantRoles = complimentaryRolesForEmail(email);
  let changed = false;

  const updated: UserProfile = { ...profile };
  if (wantPro && updated.plan !== "pro") {
    updated.plan = "pro";
    changed = true;
  }
  if (wantRoles) {
    const roles = normalizeRoles(wantRoles);
    const current = normalizeRoles(updated.roles);
    if (current.join(",") !== roles.join(",")) {
      updated.roles = roles;
      changed = true;
    }
  }

  if (!changed) return profile;

  updated.updatedAt = new Date().toISOString();
  await writeUserFile(userId, "profile.json", JSON.stringify(updated, null, 0));
  return updated;
}

export function getPlanForEmail(email: string): UserPlan {
  return planFromEmail(email);
}

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
  /** free = unlimited Claude; pro = all models */
  plan: UserPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
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
  plan?: UserPlan;
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

  try {
    return await ensureUserOnDisk(email, name, opts);
  } catch (err) {
    if (usesEphemeralUserStorage() && !usesBlobUserStorage()) {
      return { userId: userIdFromEmail(email) };
    }
    throw err;
  }
}

async function ensureUserOnDisk(
  email: string,
  name: string | undefined,
  opts: EnsureUserOptions,
): Promise<{ userId: string }> {
  await ensureDirSecure(getUsersRoot());
  await ensureDirSecure(byEmailDir());

  const key = emailKey(email);
  const indexRel = `_by-email/${key}.json`;

  let userId: string | null = null;
  const indexRaw = await readGlobalUserFile(indexRel);
  if (indexRaw) {
    try {
      const parsed = JSON.parse(indexRaw) as { userId?: unknown };
      if (typeof parsed.userId === "string" && isSafeUserId(parsed.userId)) {
        userId = parsed.userId;
      }
    } catch {
      /* bad index */
    }
  }
  if (!userId) {
    userId = userIdFromEmail(email);
    await writeGlobalUserFile(indexRel, JSON.stringify({ userId }, null, 0));
  }

  if (!usesBlobUserStorage()) {
    const dir = userDir(userId);
    await ensureDirSecure(dir);
    await mkdir(path.join(dir, "conversations"), { recursive: true, mode: 0o700 });
    await mkdir(path.join(dir, "audit"), { recursive: true, mode: 0o700 });
  }

  const now = new Date().toISOString();
  let profile: UserProfile;
  const profileRaw = await readUserFile(userId, "profile.json");
  try {
    const existing = JSON.parse(profileRaw ?? "null") as UserProfile;
    if (!existing || existing.userId !== userId) throw new Error("no profile");
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
      plan:
        normalizePlan(existing.plan) === "pro" || planFromEmail(email) === "pro" ? "pro" : "free",
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
      plan: opts.plan ? normalizePlan(opts.plan) : planFromEmail(email),
    };
  }

  await writeUserFile(userId, "profile.json", JSON.stringify(profile, null, 0));
  return { userId };
}

/** Recreate profile + email index in Blob when missing (e.g. after enabling Blob storage). */
export async function repairUserProfileForSession(session: {
  userId: string;
  email: string;
  name?: string;
}): Promise<UserProfile | null> {
  if (!isSafeUserId(session.userId)) return null;
  const email = session.email.trim().toLowerCase();
  if (!email.includes("@")) return null;

  const existing = await readUserProfile(session.userId);
  if (existing && existing.email.trim().toLowerCase() === email) {
    return existing;
  }

  const key = emailKey(email);
  const indexRel = `_by-email/${key}.json`;
  await writeGlobalUserFile(indexRel, JSON.stringify({ userId: session.userId }, null, 0));

  const now = new Date().toISOString();
  const adminRoles = complimentaryRolesForEmail(email);
  const profile: UserProfile = existing ?? {
    userId: session.userId,
    email,
    name: session.name?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    environmentId: session.userId,
    roles: normalizeRoles(adminRoles ?? ["user"]),
    authProvider: "email",
    plan: planFromEmail(email),
  };

  const repaired: UserProfile = {
    ...profile,
    userId: session.userId,
    email,
    name: session.name?.trim() || profile.name,
    updatedAt: now,
  };
  await writeUserFile(session.userId, "profile.json", JSON.stringify(repaired, null, 0));
  return repaired;
}

export async function readUserByEmail(emailRaw: string): Promise<UserProfile | null> {
  const email = emailRaw.trim().toLowerCase();
  const key = emailKey(email);
  const raw = await readGlobalUserFile(`_by-email/${key}.json`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { userId?: unknown };
      if (typeof parsed.userId === "string" && isSafeUserId(parsed.userId)) {
        return readUserProfile(parsed.userId);
      }
    } catch {
      /* not found */
    }
  }
  return null;
}

export async function readUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSafeUserId(userId)) return null;
  try {
    const raw = await readUserFile(userId, "profile.json");
    if (!raw) return null;
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
      plan: normalizePlan(p.plan),
      stripeCustomerId: typeof p.stripeCustomerId === "string" ? p.stripeCustomerId : undefined,
      stripeSubscriptionId:
        typeof p.stripeSubscriptionId === "string" ? p.stripeSubscriptionId : undefined,
    };
  } catch {
    return null;
  }
}

export async function setUserPlan(userId: string, plan: UserPlan): Promise<boolean> {
  const profile = await readUserProfile(userId);
  if (!profile) return false;
  const updated: UserProfile = {
    ...profile,
    plan: normalizePlan(plan),
    updatedAt: new Date().toISOString(),
  };
  await writeUserFile(userId, "profile.json", JSON.stringify(updated, null, 0));
  return true;
}

export async function updateUserStripeBilling(
  userId: string,
  patch: {
    plan?: UserPlan;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
  },
): Promise<boolean> {
  const profile = await readUserProfile(userId);
  if (!profile) return false;
  const updated: UserProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  if (patch.plan !== undefined) updated.plan = normalizePlan(patch.plan);
  if (patch.stripeCustomerId !== undefined) updated.stripeCustomerId = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId === null) delete updated.stripeSubscriptionId;
  else if (patch.stripeSubscriptionId !== undefined) {
    updated.stripeSubscriptionId = patch.stripeSubscriptionId;
  }
  await writeUserFile(userId, "profile.json", JSON.stringify(updated, null, 0));
  return true;
}
