import { randomUUID } from "crypto";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

import { getUsersRoot, isSafeUserId, userDir } from "@/lib/user-data-store";

export type AuditAction =
  | "auth.sign_up"
  | "auth.sign_in"
  | "auth.sign_in_sso"
  | "auth.sign_out"
  | "auth.session_verify"
  | "chat.request"
  | "chat.complete"
  | "chat.denied"
  | "connect.grant"
  | "connect.revoke"
  | "usage.limit_reached"
  | "billing.upgrade";

export type AuditEntry = {
  id: string;
  ts: string;
  action: AuditAction;
  outcome: "success" | "failure" | "denied";
  userId?: string;
  anonId?: string;
  ip: string;
  userAgent: string;
  resource?: string;
  meta?: Record<string, unknown>;
};

function auditRoot(): string {
  return path.join(getUsersRoot(), "..", "audit");
}

async function ensureAuditDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function appendAudit(entry: Omit<AuditEntry, "id" | "ts">): Promise<void> {
  const row: AuditEntry = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...entry,
  };
  const line = `${JSON.stringify(row)}\n`;

  try {
    const globalDir = auditRoot();
    await ensureAuditDir(globalDir);
    await appendFile(path.join(globalDir, "events.jsonl"), line, { mode: 0o600 });

    if (entry.userId && isSafeUserId(entry.userId)) {
      const userAuditDir = path.join(userDir(entry.userId), "audit");
      await ensureAuditDir(userAuditDir);
      await appendFile(path.join(userAuditDir, "events.jsonl"), line, { mode: 0o600 });
    }
  } catch {
    /* audit must not break primary flows */
  }
}
