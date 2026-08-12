import type { SavedConversation } from "@/lib/conversation-storage";

export type FetchConversationsResult =
  | { status: "ok"; conversations: SavedConversation[] }
  | { status: "unauthorized" }
  | { status: "error" };

export async function fetchServerConversations(): Promise<FetchConversationsResult> {
  try {
    const res = await fetch("/api/conversations", { credentials: "include", cache: "no-store" });
    if (res.status === 401) return { status: "unauthorized" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { conversations?: unknown };
    if (!Array.isArray(data.conversations)) return { status: "ok", conversations: [] };
    return { status: "ok", conversations: data.conversations as SavedConversation[] };
  } catch {
    return { status: "error" };
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
