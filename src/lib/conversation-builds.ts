import type { ChatBuildArtifact } from "@/lib/chat-types";
import {
  conversationStorageUserId,
  loadConversations,
  type ConversationScope,
} from "@/lib/conversation-storage";

export type ConversationBuildRow = {
  conversationId: string;
  scope: ConversationScope;
  title: string;
  updatedAt: number;
  language: string;
  primaryPath?: string;
  fileCount: number;
  incomplete?: boolean;
};

/** Apps / canvases still attached to chats (even if not yet save_app'd). */
export function listConversationBuilds(userId?: string | null): ConversationBuildRow[] {
  const storageUser = conversationStorageUserId(userId);
  const scopes: ConversationScope[] = ["ask", "assistant"];
  const rows: ConversationBuildRow[] = [];

  for (const scope of scopes) {
    for (const c of loadConversations(scope, storageUser)) {
      const art = c.buildArtifact;
      if (!art || typeof art.code !== "string" || !art.code.trim()) continue;
      rows.push(rowFromConversation(c.id, c.title, c.updatedAt, scope, art));
    }
  }

  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

function rowFromConversation(
  conversationId: string,
  title: string,
  updatedAt: number,
  scope: ConversationScope,
  art: ChatBuildArtifact,
): ConversationBuildRow {
  const fileCount =
    Array.isArray(art.files) && art.files.length > 0 ? art.files.length : 1;
  return {
    conversationId,
    scope,
    title: title || "Untitled chat",
    updatedAt,
    language: art.language,
    primaryPath: art.primaryPath,
    fileCount,
    incomplete: Boolean(art.incomplete),
  };
}
