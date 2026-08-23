import { randomUUID } from "crypto";

import type { SavedConversation } from "@/lib/conversation-storage";
import {
  readUserConversations,
  writeUserConversations,
} from "@/lib/user-conversations-store";

const MAX_CONVERSATIONS = 80;

export function conversationTitleFromResult(
  taskName: string,
  result: string,
  dateLabel: string,
): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(result);
  const raw = heading?.[1]?.trim() || `${taskName} — ${dateLabel}`;
  return raw.replace(/\s+/g, " ").slice(0, 80);
}

/**
 * Persist a scheduled-task result as a real sidebar conversation.
 * Same-day reruns upsert `task_<id>_<isoDate>` so Run now + the morning cron share one chat.
 */
export async function saveTaskConversation(opts: {
  userId: string;
  taskId: string;
  taskName: string;
  prompt: string;
  result: string;
  isoDate: string;
  dateLabel: string;
}): Promise<string> {
  const id = `task_${opts.taskId}_${opts.isoDate}`;
  const now = Date.now();
  const conversation: SavedConversation = {
    id,
    title: conversationTitleFromResult(opts.taskName, opts.result, opts.dateLabel),
    updatedAt: now,
    messages: [
      { id: randomUUID(), role: "user", content: opts.prompt },
      { id: randomUUID(), role: "assistant", content: opts.result },
    ],
    agentId: null,
    agentName: null,
    source: "task",
    taskId: opts.taskId,
  };

  const existing = await readUserConversations(opts.userId);
  const next = [conversation, ...existing.filter((c) => c.id !== id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
  await writeUserConversations(opts.userId, next);
  return id;
}
