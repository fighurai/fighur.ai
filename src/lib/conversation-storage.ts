import type { ChatBuildArtifact, ChatMessage } from "@/lib/chat-types";

export type SavedConversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  buildArtifact?: ChatBuildArtifact | null;
};

export type ConversationScope = "ask" | "assistant";

/** Local-only chats before sign-in; migrated to account key on first login. */
export const ANONYMOUS_STORAGE_USER = "anonymous";

export function conversationStorageUserId(userId?: string | null): string {
  return userId && userId.length > 0 ? userId : ANONYMOUS_STORAGE_USER;
}

function storageKeys(scope: ConversationScope, storageUser: string) {
  const base =
    scope === "ask" ? "fighurai-conversations-v1" : "fighurai-assistant-conversations-v1";
  const activeBase =
    scope === "ask" ? "fighurai-conversations-active-id" : "fighurai-assistant-active-id";
  return {
    list: `${base}:${storageUser}`,
    active: `${activeBase}:${storageUser}`,
  };
}

const MAX_CONVERSATIONS = 80;

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser?.content?.trim()) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

export function loadConversations(
  scope: ConversationScope = "ask",
  storageUser: string = ANONYMOUS_STORAGE_USER,
): SavedConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKeys(scope, storageUser).list);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedConversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          Array.isArray(c.messages) &&
          typeof c.updatedAt === "number" &&
          (c.buildArtifact === undefined ||
            c.buildArtifact === null ||
            (typeof c.buildArtifact === "object" &&
              typeof (c.buildArtifact as { language?: unknown }).language === "string" &&
              typeof (c.buildArtifact as { code?: unknown }).code === "string")),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function loadLastActiveId(
  scope: ConversationScope = "ask",
  storageUser: string = ANONYMOUS_STORAGE_USER,
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(storageKeys(scope, storageUser).active);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveLastActiveId(
  id: string | null,
  scope: ConversationScope = "ask",
  storageUser: string = ANONYMOUS_STORAGE_USER,
) {
  if (typeof window === "undefined") return;
  try {
    const key = storageKeys(scope, storageUser).active;
    if (id === null) localStorage.removeItem(key);
    else localStorage.setItem(key, id);
  } catch {
    /* quota */
  }
}

export function persistConversations(
  list: SavedConversation[],
  scope: ConversationScope = "ask",
  storageUser: string = ANONYMOUS_STORAGE_USER,
) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = list
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(storageKeys(scope, storageUser).list, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

export function upsertConversation(
  list: SavedConversation[],
  patch: SavedConversation,
): SavedConversation[] {
  const next = list.filter((c) => c.id !== patch.id);
  next.push({
    ...patch,
    title: patch.title || deriveTitle(patch.messages),
    updatedAt: patch.updatedAt,
  });
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeConversation(
  list: SavedConversation[],
  id: string,
): SavedConversation[] {
  return list.filter((c) => c.id !== id);
}

/** Copy anonymous local chats into the signed-in user's bucket once. */
export function migrateAnonymousConversationsToUser(
  userId: string,
  scope: ConversationScope = "assistant",
): void {
  if (typeof window === "undefined" || !userId) return;
  const anon = loadConversations(scope, ANONYMOUS_STORAGE_USER);
  if (anon.length === 0) return;
  const existing = loadConversations(scope, userId);
  if (existing.length > 0) return;
  persistConversations(anon, scope, userId);
}

export { deriveTitle };
