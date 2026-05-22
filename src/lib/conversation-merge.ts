import type { SavedConversation } from "@/lib/conversation-storage";

/** Merge local and server chat lists; newer updatedAt wins per id. */
export function mergeConversations(
  local: SavedConversation[],
  server: SavedConversation[],
): SavedConversation[] {
  const byId = new Map<string, SavedConversation>();
  for (const c of server) {
    if (c?.id) byId.set(c.id, c);
  }
  for (const c of local) {
    if (!c?.id) continue;
    const prev = byId.get(c.id);
    if (!prev || c.updatedAt >= prev.updatedAt) {
      byId.set(c.id, c);
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
