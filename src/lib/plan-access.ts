import {
  CHAT_MODEL_OPTIONS,
  getChatModelById,
  resolveChatModelOption,
  type ChatModelOption,
} from "@/lib/chat-models";
import { hasPermission, normalizeRoles, type Role } from "@/lib/rbac";
import { DEFAULT_CHAT_MODEL_ID } from "@/lib/site-brand";
import type { UserPlan } from "@/lib/user-data-store";

/** Free signed-up (and anonymous trial) users may only use this model. */
export const FREE_TIER_MODEL_ID = DEFAULT_CHAT_MODEL_ID;

export type ClientPlan = UserPlan | "trial";

/** Pro subscribers and admins may use every configured model. */
export function hasAllModelsAccess(plan: UserPlan, roles: Role[]): boolean {
  if (plan === "pro") return true;
  return hasPermission(roles, "admin:users") || roles.includes("admin");
}

export function allowedModelIdsForPlan(plan: UserPlan, roles: Role[]): string[] {
  if (hasAllModelsAccess(plan, roles)) {
    return CHAT_MODEL_OPTIONS.map((m) => m.id);
  }
  return [FREE_TIER_MODEL_ID];
}

/**
 * Resolves the model for this request; free-tier users are pinned to Claude.
 */
export function resolveChatModelForAccess(
  requestedId: string | undefined,
  plan: UserPlan,
  roles: Role[],
): ChatModelOption | null {
  if (hasAllModelsAccess(plan, roles)) {
    return resolveChatModelOption(requestedId);
  }

  const claude = getChatModelById(FREE_TIER_MODEL_ID);
  if (claude) {
    return resolveChatModelOption(FREE_TIER_MODEL_ID);
  }

  return resolveChatModelOption(requestedId);
}

export function clientPlanLabel(plan: ClientPlan): string {
  switch (plan) {
    case "pro":
      return "Pro";
    case "free":
      return "Free";
    case "trial":
      return "Trial";
    default:
      return "Free";
  }
}

export function freeTierModelLabel(): string {
  return getChatModelById(FREE_TIER_MODEL_ID)?.label ?? "Claude";
}
