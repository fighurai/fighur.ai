import type { SmileServerSession } from "@/lib/session-cookie";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";
import { hasPermission, normalizeRoles, type Permission, type Role } from "@/lib/rbac";
import { ANONYMOUS_SPEND_LIMIT_USD } from "@/lib/usage-constants";
import {
  anonymousLimitReached,
  getAnonymousUsage,
  getUserUsage,
  remainingAnonymousUsd,
} from "@/lib/usage-wallet";
import {
  normalizePlan,
  readUserProfile,
  type UserPlan,
  type UserProfile,
} from "@/lib/user-data-store";

export type ChatAccessResult =
  | { allowed: true; userId?: string; anonId?: string; roles: Role[] }
  | {
      allowed: false;
      code: "SIGNUP_REQUIRED" | "FORBIDDEN" | "USAGE_LIMIT";
      message: string;
      spentUsd?: number;
      limitUsd?: number;
    };

export async function resolveUserRoles(
  userId: string,
  session?: SmileServerSession | null,
): Promise<Role[]> {
  const profile = await readUserProfile(userId);
  if (profile) return normalizeRoles(profile.roles);
  if (session?.userId === userId) return normalizeRoles(session.roles);
  return ["user"];
}

export async function resolveUserPlan(
  userId: string,
  session?: SmileServerSession | null,
): Promise<UserPlan> {
  const profile = await readUserProfile(userId);
  if (profile) return normalizePlan(profile.plan);
  if (session?.userId === userId) return session.plan === "pro" ? "pro" : "free";
  return "free";
}

export async function requirePermission(
  session: SmileServerSession | null,
  permission: Permission,
): Promise<{ ok: true; roles: Role[] } | { ok: false; message: string }> {
  if (!session) {
    return { ok: false, message: "Sign in required." };
  }
  const profile = await readUserProfile(session.userId);
  if (!profile && !usesEphemeralUserStorage()) {
    return { ok: false, message: "Account not found." };
  }
  const roles = profile
    ? normalizeRoles(profile.roles)
    : normalizeRoles(session.roles ?? ["user"]);
  const extra = profile?.permissions;
  if (!hasPermission(roles, permission, extra)) {
    return { ok: false, message: "You do not have permission for this action." };
  }
  return { ok: true, roles };
}

export async function checkChatAccess(
  session: SmileServerSession | null,
  anonId: string | null,
): Promise<ChatAccessResult> {
  if (session) {
    const perm = await requirePermission(session, "chat:use");
    if (!perm.ok) {
      return { allowed: false, code: "FORBIDDEN", message: perm.message };
    }
    return { allowed: true, userId: session.userId, roles: perm.roles };
  }

  if (!anonId) {
    return {
      allowed: false,
      code: "SIGNUP_REQUIRED",
      message: "Create an account to use chat.",
    };
  }

  const wallet = await getAnonymousUsage(anonId);
  if (anonymousLimitReached(wallet)) {
    return {
      allowed: false,
      code: "USAGE_LIMIT",
      message: `You have used $${ANONYMOUS_SPEND_LIMIT_USD.toFixed(2)} in trial AI usage. Create a free account to continue.`,
      spentUsd: wallet.spentUsd,
      limitUsd: ANONYMOUS_SPEND_LIMIT_USD,
    };
  }

  return { allowed: true, anonId, roles: ["viewer"] };
}

export async function getUsageSummaryForClient(
  session: SmileServerSession | null,
  anonId: string | null,
): Promise<{
  signedIn: boolean;
  spentUsd: number;
  limitUsd: number | null;
  remainingUsd: number | null;
  signupRequired: boolean;
  environmentId: string | null;
}> {
  if (session) {
    const wallet = await getUserUsage(session.userId);
    return {
      signedIn: true,
      spentUsd: wallet.spentUsd,
      limitUsd: null,
      remainingUsd: null,
      signupRequired: false,
      environmentId: session.userId,
    };
  }
  if (!anonId) {
    return {
      signedIn: false,
      spentUsd: 0,
      limitUsd: ANONYMOUS_SPEND_LIMIT_USD,
      remainingUsd: ANONYMOUS_SPEND_LIMIT_USD,
      signupRequired: false,
      environmentId: null,
    };
  }
  const wallet = await getAnonymousUsage(anonId);
  return {
    signedIn: false,
    spentUsd: wallet.spentUsd,
    limitUsd: ANONYMOUS_SPEND_LIMIT_USD,
    remainingUsd: remainingAnonymousUsd(wallet),
    signupRequired: anonymousLimitReached(wallet),
    environmentId: null,
  };
}

export type { UserProfile };
