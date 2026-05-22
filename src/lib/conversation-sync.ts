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

export type SaveConversationsResult =
  | { ok: true }
  | { ok: false; status: number; error?: string };

export async function saveServerConversations(
  list: SavedConversation[],
): Promise<SaveConversationsResult> {
  try {
    const res = await fetch("/api/conversations", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: list }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: res.status, error: data.error };
  } catch {
    return { ok: false, status: 0, error: "Network error" };
  }
}
