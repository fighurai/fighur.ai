import {
  CHAT_MODEL_OPTIONS,
  getChatModelById,
  resolveChatModelOption,
  type ChatModelOption,
} from "@/lib/chat-models";
import { hasPermission, type Role } from "@/lib/rbac";
import { isAutoModelId, resolveAutoChatModel } from "@/lib/route-llm";
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

export type ResolvedChatModel = {
  option: ChatModelOption;
  /** Present when RouteLLM auto routing chose the model. */
  routedBucket?: string;
  requestedAuto?: boolean;
};

/**
 * Resolves the model for this request.
 * - Explicit catalog id: Pro can force any configured model; free stays pinned to Claude.
 * - `auto`: rules-based RouteLLM pick within the plan allowlist.
 */
export function resolveChatModelForAccess(
  requestedId: string | undefined,
  plan: UserPlan,
  roles: Role[],
  userText = "",
): ChatModelOption | null {
  return resolveChatModelForAccessDetailed(requestedId, plan, roles, userText)?.option ?? null;
}

export function resolveChatModelForAccessDetailed(
  requestedId: string | undefined,
  plan: UserPlan,
  roles: Role[],
  userText = "",
): ResolvedChatModel | null {
  const allowed = allowedModelIdsForPlan(plan, roles);

  if (isAutoModelId(requestedId)) {
    const routed = resolveAutoChatModel(userText, allowed);
    if (!routed) return null;
    return {
      option: routed.option,
      routedBucket: routed.bucket,
      requestedAuto: true,
    };
  }

  if (hasAllModelsAccess(plan, roles)) {
    const option = resolveChatModelOption(requestedId);
    return option ? { option } : null;
  }

  const claude = getChatModelById(FREE_TIER_MODEL_ID);
  if (claude) {
    const option = resolveChatModelOption(FREE_TIER_MODEL_ID);
    return option ? { option } : null;
  }

  const option = resolveChatModelOption(requestedId);
  return option ? { option } : null;
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
