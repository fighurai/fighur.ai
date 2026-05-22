import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import type { GoogleCookiePayload, MicrosoftCookiePayload, SlackCookiePayload } from "@/lib/oauth-payload-types";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import { getAppSealingSecret, sealJson, unsealJson } from "@/lib/oauth-crypto";
import { isSafeUserId, userDir } from "@/lib/user-data-store";

const GOOGLE_FILE = "google.sealed";
const MICROSOFT_FILE = "microsoft.sealed";
const SLACK_FILE = "slack.sealed";

async function connectionsDir(userId: string): Promise<string> {
  const base = path.join(userDir(userId), "connections");
  await mkdir(base, { recursive: true, mode: 0o700 });
  return base;
}

export async function writeGoogleConnection(userId: string, payload: GoogleCookiePayload): Promise<void> {
  const secret = getAppSealingSecret();
  if (!secret) throw new Error("Missing sealing secret");
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const dir = await connectionsDir(userId);
  await writeFile(path.join(dir, GOOGLE_FILE), sealJson(payload, secret), { mode: 0o600 });
}

export async function writeMicrosoftConnection(
  userId: string,
  payload: MicrosoftCookiePayload,
): Promise<void> {
  const secret = getAppSealingSecret();
  if (!secret) throw new Error("Missing sealing secret");
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const dir = await connectionsDir(userId);
  await writeFile(path.join(dir, MICROSOFT_FILE), sealJson(payload, secret), { mode: 0o600 });
}

export async function writeSlackConnection(userId: string, payload: SlackCookiePayload): Promise<void> {
  const secret = getAppSealingSecret();
  if (!secret) throw new Error("Missing sealing secret");
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const dir = await connectionsDir(userId);
  await writeFile(path.join(dir, SLACK_FILE), sealJson(payload, secret), { mode: 0o600 });
}

async function readSealedFile<T>(userId: string, file: string, secret: string): Promise<T | null> {
  if (!isSafeUserId(userId)) return null;
  try {
    const raw = await readFile(path.join(userDir(userId), "connections", file), "utf8");
    return unsealJson<T>(raw.trim(), secret);
  } catch {
    return null;
  }
}

export async function deleteProviderConnection(
  userId: string,
  provider: "google" | "microsoft" | "slack",
): Promise<void> {
  if (!isSafeUserId(userId)) return;
  const file =
    provider === "google" ? GOOGLE_FILE : provider === "microsoft" ? MICROSOFT_FILE : SLACK_FILE;
  try {
    await unlink(path.join(userDir(userId), "connections", file));
  } catch {
    /* missing */
  }
}

export async function loadIntegrationFlagsFromUserStore(
  userId: string,
  secret: string,
  request?: Request,
): Promise<Partial<ChatIntegrationFlags>> {
  const out: Partial<ChatIntegrationFlags> = {};

  const g = await readGoogleFromStore(userId, secret, request);
  if (g) {
    out.gmail = true;
    out.googleCalendar = true;
  }

  const m = await readMicrosoftFromStore(userId, secret, request);
  if (m) {
    out.outlook = true;
    out.microsoft365 = true;
  }

  const s = await readSlackFromStore(userId, secret, request);
  if (s) {
    out.slack = true;
  }

  return out;
}

export async function readGoogleFromStore(
  userId: string,
  secret: string,
  request?: Request,
): Promise<GoogleCookiePayload | null> {
  const p = await readSealedFile<GoogleCookiePayload>(userId, GOOGLE_FILE, secret);
  if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) return p;
  if (request) {
    const { readGoogleConnectionCookie } = await import("@/lib/connection-cookies");
    return readGoogleConnectionCookie(request, userId);
  }
  return null;
}

export async function readMicrosoftFromStore(
  userId: string,
  secret: string,
  request?: Request,
): Promise<MicrosoftCookiePayload | null> {
  const p = await readSealedFile<MicrosoftCookiePayload>(userId, MICROSOFT_FILE, secret);
  if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) return p;
  if (request) {
    const { readMicrosoftConnectionCookie } = await import("@/lib/connection-cookies");
    return readMicrosoftConnectionCookie(request, userId);
  }
  return null;
}

export async function readSlackFromStore(
  userId: string,
  secret: string,
  request?: Request,
): Promise<SlackCookiePayload | null> {
  const p = await readSealedFile<SlackCookiePayload>(userId, SLACK_FILE, secret);
  if (p?.v === 1 && typeof p.access_token === "string" && p.access_token.length > 0) return p;
  if (request) {
    const { readSlackConnectionCookie } = await import("@/lib/connection-cookies");
    return readSlackConnectionCookie(request, userId);
  }
  return null;
}
