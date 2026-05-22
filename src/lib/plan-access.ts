import {
  CHAT_MODEL_OPTIONS,
  getChatModelById,
  resolveChatModelOption,
  type ChatModelOption,
} from "@/lib/chat-models";
import { hasPermission, normalizeRoles, type Role } from "@/lib/rbac";
import { DEFAULT_CHAT_MODEL_ID } from "@/lib/site-brand";

/** Free signed-up (and anonymous trial) users may only use this model. */
export const FREE_TIER_MODEL_ID = DEFAULT_CHAT_MODEL_ID;

export function isFullModelAccess(roles: Role[]): boolean {
  return hasPermission(roles, "admin:users") || roles.includes("admin");
}

export function allowedModelIdsForRoles(roles: Role[]): string[] {
  if (isFullModelAccess(roles)) {
    return CHAT_MODEL_OPTIONS.map((m) => m.id);
  }
  return [FREE_TIER_MODEL_ID];
}

/**
 * Resolves the model for this request; free-tier users are always pinned to Claude.
 */
export function resolveChatModelForAccess(
  requestedId: string | undefined,
  roles: Role[],
): ChatModelOption | null {
  if (isFullModelAccess(roles)) {
    return resolveChatModelOption(requestedId);
  }

  const claude = getChatModelById(FREE_TIER_MODEL_ID);
  if (claude) {
    return resolveChatModelOption(FREE_TIER_MODEL_ID);
  }

  return resolveChatModelOption(requestedId);
}

export function freeTierModelLabel(): string {
  return getChatModelById(FREE_TIER_MODEL_ID)?.label ?? "Claude";
}
