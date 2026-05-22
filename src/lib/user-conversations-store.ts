import type { SavedConversation } from "@/lib/conversation-storage";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "conversations/conversations.json";
const MAX_BYTES = 2_000_000;

export async function readUserConversations(userId: string): Promise<SavedConversation[]> {
  if (!isSafeUserId(userId)) return [];
  try {
    const raw = await readUserFile(userId, FILE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is SavedConversation =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        Array.isArray((c as { messages?: unknown }).messages),
    );
  } catch {
    return [];
  }
}

export async function writeUserConversations(
  userId: string,
  list: SavedConversation[],
): Promise<void> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const payload = JSON.stringify(list);
  if (payload.length > MAX_BYTES) {
    throw new Error("Conversation data exceeds storage limit.");
  }
  await writeUserFile(userId, FILE, payload);
}
