import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { SavedConversation } from "@/lib/conversation-storage";
import { isSafeUserId, userDir } from "@/lib/user-data-store";

const FILE = "conversations.json";
const MAX_BYTES = 2_000_000;

async function conversationsPath(userId: string): Promise<string> {
  const dir = path.join(userDir(userId), "conversations");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, FILE);
}

export async function readUserConversations(userId: string): Promise<SavedConversation[]> {
  if (!isSafeUserId(userId)) return [];
  try {
    const raw = await readFile(await conversationsPath(userId), "utf8");
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
  await writeFile(await conversationsPath(userId), payload, { mode: 0o600 });
}
