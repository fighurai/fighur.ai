import type { SavedConversation } from "@/lib/conversation-storage";

export async function fetchServerConversations(): Promise<SavedConversation[] | null> {
  try {
    const res = await fetch("/api/conversations", { credentials: "include", cache: "no-store" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { conversations?: unknown };
    if (!Array.isArray(data.conversations)) return [];
    return data.conversations as SavedConversation[];
  } catch {
    return null;
  }
}

export async function saveServerConversations(list: SavedConversation[]): Promise<boolean> {
  try {
    const res = await fetch("/api/conversations", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: list }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
