import type { ChatBuildArtifact, ChatMessage } from "@/lib/chat-types";

export type SavedConversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  buildArtifact?: ChatBuildArtifact | null;
};

export type ConversationScope = "ask" | "assistant";

const STORAGE_BY_SCOPE: Record<
  ConversationScope,
  { list: string; active: string }
> = {
  ask: {
    list: "fighurai-conversations-v1",
    active: "fighurai-conversations-active-id",
  },
  assistant: {
    list: "fighurai-assistant-conversations-v1",
    active: "fighurai-assistant-active-id",
  },
};

const MAX_CONVERSATIONS = 80;

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser?.content?.trim()) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

export function loadConversations(
  scope: ConversationScope = "ask",
): SavedConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_BY_SCOPE[scope].list);
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
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_BY_SCOPE[scope].active);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveLastActiveId(
  id: string | null,
  scope: ConversationScope = "ask",
) {
  if (typeof window === "undefined") return;
  try {
    const key = STORAGE_BY_SCOPE[scope].active;
    if (id === null) localStorage.removeItem(key);
    else localStorage.setItem(key, id);
  } catch {
    /* quota */
  }
}

export function persistConversations(
  list: SavedConversation[],
  scope: ConversationScope = "ask",
) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = list
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_BY_SCOPE[scope].list, JSON.stringify(trimmed));
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

export { deriveTitle };
