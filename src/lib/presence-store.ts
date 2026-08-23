import { randomUUID } from "crypto";

import { formatUserLocationLabel, type UserLocationHint } from "@/lib/client-location";
import {
  readGlobalUserFile,
  writeGlobalUserFile,
} from "@/lib/user-file-storage";

export const PRESENCE_FILE = "_presence/state.json";

const MAX_VISITORS = 800;
const MAX_EVENTS = 500;

export type PresenceAction =
  | "page.view"
  | "auth.sign_up"
  | "auth.sign_in"
  | "auth.sign_in_sso"
  | "chat.request"
  | "account.delete";

export type PresenceLocation = {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  timezone?: string;
  source?: UserLocationHint["source"];
  label?: string;
};

export type PresenceVisitor = {
  key: string;
  hasAccount: boolean;
  userId?: string;
  email?: string;
  name?: string;
  plan?: "free" | "pro";
  authProvider?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastAction: PresenceAction;
  lastPath?: string;
  lastLocation?: PresenceLocation;
  lastIp?: string;
  lastDevice?: string;
  visitCount: number;
};

export type PresenceEvent = {
  id: string;
  ts: string;
  action: PresenceAction;
  visitorKey: string;
  hasAccount: boolean;
  userId?: string;
  email?: string;
  anonId?: string;
  path?: string;
  location?: PresenceLocation;
  ip?: string;
  device?: string;
};

export type PresenceState = {
  v: 1;
  visitors: Record<string, PresenceVisitor>;
  events: PresenceEvent[];
};

export type PresenceTouch = {
  action: PresenceAction;
  userId?: string;
  email?: string;
  name?: string;
  plan?: "free" | "pro";
  authProvider?: string;
  anonId?: string;
  path?: string;
  location?: PresenceLocation | null;
  ip?: string;
  device?: string;
  /** When true, always append an event even if the visitor was seen recently. */
  forceEvent?: boolean;
};

const MIN_TOUCH_MS = 2 * 60 * 1000;

function emptyState(): PresenceState {
  return { v: 1, visitors: {}, events: [] };
}

export function visitorKeyFor(input: { userId?: string; anonId?: string }): string | null {
  if (input.userId) return `u:${input.userId}`;
  if (input.anonId) return `a:${input.anonId}`;
  return null;
}

export function locationSnapshot(loc: UserLocationHint | null | undefined): PresenceLocation | undefined {
  if (!loc) return undefined;
  const label = formatUserLocationLabel(loc) ?? undefined;
  const snap: PresenceLocation = {
    city: loc.city,
    region: loc.region,
    country: loc.country,
    countryCode: loc.countryCode,
    timezone: loc.timezone,
    source: loc.source,
    label,
  };
  if (!snap.city && !snap.region && !snap.country && !snap.label) return undefined;
  return snap;
}

export async function readPresenceState(): Promise<PresenceState> {
  const raw = await readGlobalUserFile(PRESENCE_FILE);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<PresenceState>;
    if (parsed.v !== 1 || !parsed.visitors || typeof parsed.visitors !== "object") {
      return emptyState();
    }
    return {
      v: 1,
      visitors: parsed.visitors,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return emptyState();
  }
}

async function writePresenceState(state: PresenceState): Promise<void> {
  await writeGlobalUserFile(PRESENCE_FILE, JSON.stringify(state));
}

function pruneState(state: PresenceState): PresenceState {
  const visitors = Object.values(state.visitors).sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
  const kept = visitors.slice(0, MAX_VISITORS);
  return {
    v: 1,
    visitors: Object.fromEntries(kept.map((v) => [v.key, v])),
    events: state.events.slice(0, MAX_EVENTS),
  };
}

function locationChanged(prev: PresenceLocation | undefined, next: PresenceLocation | undefined): boolean {
  if (!next) return false;
  if (!prev) return true;
  return (prev.label || "") !== (next.label || "") || (prev.city || "") !== (next.city || "");
}

let writeChain: Promise<void> = Promise.resolve();

export async function touchPresence(touch: PresenceTouch): Promise<void> {
  const key = visitorKeyFor(touch);
  if (!key) return;

  const run = writeChain.then(async () => {
    const state = await readPresenceState();
    const now = new Date().toISOString();
    const existing = state.visitors[key];
    const lastMs = existing ? Date.parse(existing.lastSeenAt) : 0;
    const recent = Number.isFinite(lastMs) && Date.now() - lastMs < MIN_TOUCH_MS;
    const loc = touch.location ?? existing?.lastLocation;
    const changedPlace = locationChanged(existing?.lastLocation, touch.location ?? undefined);
    const changedPath = Boolean(touch.path && touch.path !== existing?.lastPath);
    const shouldEvent = Boolean(touch.forceEvent) || !existing || !recent || changedPlace || changedPath;

    const visitor: PresenceVisitor = {
      key,
      hasAccount: Boolean(touch.userId) || Boolean(existing?.hasAccount && !touch.anonId),
      userId: touch.userId ?? existing?.userId,
      email: touch.email ?? existing?.email,
      name: touch.name ?? existing?.name,
      plan: touch.plan ?? existing?.plan,
      authProvider: touch.authProvider ?? existing?.authProvider,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      lastAction: touch.action,
      lastPath: touch.path ?? existing?.lastPath,
      lastLocation: loc,
      lastIp: touch.ip ?? existing?.lastIp,
      lastDevice: touch.device ?? existing?.lastDevice,
      visitCount: (existing?.visitCount ?? 0) + (shouldEvent ? 1 : 0),
    };
    if (touch.userId) visitor.hasAccount = true;

    state.visitors[key] = visitor;

    if (touch.userId && touch.anonId) {
      const anonKey = visitorKeyFor({ anonId: touch.anonId });
      if (anonKey && anonKey !== key && state.visitors[anonKey]) {
        const guest = state.visitors[anonKey];
        visitor.visitCount += guest.visitCount;
        visitor.firstSeenAt =
          guest.firstSeenAt < visitor.firstSeenAt ? guest.firstSeenAt : visitor.firstSeenAt;
        if (!visitor.lastLocation && guest.lastLocation) visitor.lastLocation = guest.lastLocation;
        delete state.visitors[anonKey];
        state.visitors[key] = visitor;
      }
    }

    if (shouldEvent) {
      state.events.unshift({
        id: randomUUID(),
        ts: now,
        action: touch.action,
        visitorKey: key,
        hasAccount: visitor.hasAccount,
        userId: visitor.userId,
        email: visitor.email,
        anonId: touch.anonId,
        path: touch.path,
        location: loc,
        ip: touch.ip,
        device: touch.device,
      });
    }

    await writePresenceState(pruneState(state));
  });

  writeChain = run.catch(() => {
    /* keep chain alive */
  });
  await run;
}

export async function removePresenceForUser(userId: string): Promise<void> {
  const key = visitorKeyFor({ userId });
  if (!key) return;
  const run = writeChain.then(async () => {
    const state = await readPresenceState();
    delete state.visitors[key];
    state.events = state.events.filter((e) => e.userId !== userId && e.visitorKey !== key);
    await writePresenceState(state);
  });
  writeChain = run.catch(() => {});
  await run;
}

export function summarizePresence(state: PresenceState): {
  total: number;
  accounts: number;
  guests: number;
  active15m: number;
  countries: number;
} {
  const visitors = Object.values(state.visitors);
  const cutoff = Date.now() - 15 * 60 * 1000;
  const countries = new Set(
    visitors.map((v) => v.lastLocation?.country).filter((c): c is string => Boolean(c)),
  );
  return {
    total: visitors.length,
    accounts: visitors.filter((v) => v.hasAccount).length,
    guests: visitors.filter((v) => !v.hasAccount).length,
    active15m: visitors.filter((v) => Date.parse(v.lastSeenAt) >= cutoff).length,
    countries: countries.size,
  };
}
