import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { getUsersRoot, isSafeUserId, userDir } from "@/lib/user-data-store";
import { ANONYMOUS_SPEND_LIMIT_USD } from "@/lib/usage-constants";

export { ANONYMOUS_SPEND_LIMIT_USD };

export type UsageWallet = {
  spentUsd: number;
  totalInputChars: number;
  totalOutputChars: number;
  requestCount: number;
  updatedAt: string;
};

function defaultWallet(): UsageWallet {
  return {
    spentUsd: 0,
    totalInputChars: 0,
    totalOutputChars: 0,
    requestCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function usageRoot(): string {
  return path.join(getUsersRoot(), "..", "usage");
}

function anonWalletPath(anonId: string): string {
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(anonId)) throw new Error("Invalid anonymous id");
  return path.join(usageRoot(), "anonymous", `${anonId}.json`);
}

function userWalletPath(userId: string): string {
  return path.join(userDir(userId), "usage.json");
}

async function readWallet(filePath: string): Promise<UsageWallet> {
  try {
    const raw = await readFile(filePath, "utf8");
    const w = JSON.parse(raw) as UsageWallet;
    return {
      spentUsd: typeof w.spentUsd === "number" ? w.spentUsd : 0,
      totalInputChars: typeof w.totalInputChars === "number" ? w.totalInputChars : 0,
      totalOutputChars: typeof w.totalOutputChars === "number" ? w.totalOutputChars : 0,
      requestCount: typeof w.requestCount === "number" ? w.requestCount : 0,
      updatedAt: typeof w.updatedAt === "string" ? w.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultWallet();
  }
}

async function writeWallet(filePath: string, wallet: UsageWallet): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, JSON.stringify(wallet, null, 0), { mode: 0o600 });
}

export async function getAnonymousUsage(anonId: string): Promise<UsageWallet> {
  return readWallet(anonWalletPath(anonId));
}

export async function getUserUsage(userId: string): Promise<UsageWallet> {
  if (!isSafeUserId(userId)) return defaultWallet();
  return readWallet(userWalletPath(userId));
}

export async function recordAnonymousUsage(
  anonId: string,
  delta: { costUsd: number; inputChars: number; outputChars: number },
): Promise<UsageWallet> {
  const filePath = anonWalletPath(anonId);
  const wallet = await readWallet(filePath);
  wallet.spentUsd += delta.costUsd;
  wallet.totalInputChars += delta.inputChars;
  wallet.totalOutputChars += delta.outputChars;
  wallet.requestCount += 1;
  wallet.updatedAt = new Date().toISOString();
  await writeWallet(filePath, wallet);
  return wallet;
}

export async function recordUserUsage(
  userId: string,
  delta: { costUsd: number; inputChars: number; outputChars: number },
): Promise<UsageWallet> {
  if (!isSafeUserId(userId)) return defaultWallet();
  const filePath = userWalletPath(userId);
  const wallet = await readWallet(filePath);
  wallet.spentUsd += delta.costUsd;
  wallet.totalInputChars += delta.inputChars;
  wallet.totalOutputChars += delta.outputChars;
  wallet.requestCount += 1;
  wallet.updatedAt = new Date().toISOString();
  await writeWallet(filePath, wallet);
  return wallet;
}

export function anonymousLimitReached(wallet: UsageWallet): boolean {
  return wallet.spentUsd >= ANONYMOUS_SPEND_LIMIT_USD - 1e-9;
}

export function remainingAnonymousUsd(wallet: UsageWallet): number {
  return Math.max(0, ANONYMOUS_SPEND_LIMIT_USD - wallet.spentUsd);
}
