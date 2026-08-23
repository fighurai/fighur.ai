import { parseClientLocationPayload, type UserLocationHint } from "@/lib/client-location";
import {
  locationSnapshot,
  touchPresence,
  type PresenceAction,
  type PresenceTouch,
} from "@/lib/presence-store";
import { createHash } from "crypto";

import { clientIp, userAgent } from "@/lib/request-context";
import { resolveUserLocation, resolveUserLocationFast } from "@/lib/resolve-user-location";
import { parseTrafficSource, type TrafficSource } from "@/lib/traffic-source";
import { summarizeUserAgent } from "@/lib/user-agent-summary";
import { readUserProfile } from "@/lib/user-data-store";

export type RecordPresenceInput = {
  action: PresenceAction;
  userId?: string;
  email?: string;
  name?: string;
  plan?: "free" | "pro";
  authProvider?: string;
  anonId?: string;
  path?: string;
  search?: string;
  referrer?: string;
  traffic?: TrafficSource | null;
  clientHint?: UserLocationHint | null;
  forceEvent?: boolean;
};

function safePath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.length > 180) return trimmed.slice(0, 180);
  return trimmed;
}

function fallbackGuestId(ip: string, ua: string): string | undefined {
  if (!ip || ip === "unknown") return undefined;
  const hex = createHash("sha256").update(`touch:${ip}:${ua.slice(0, 80)}`, "utf8").digest("hex").slice(0, 22);
  return `ip_${hex}`;
}

export async function recordPresence(request: Request, input: RecordPresenceInput): Promise<void> {
  try {
    const anonId = input.anonId ?? (!input.userId ? fallbackGuestId(clientIp(request), userAgent(request)) : undefined);
    if (!input.userId && !anonId) return;

    let email = input.email;
    let name = input.name;
    let plan = input.plan;
    let authProvider = input.authProvider;

    if (input.userId && (!email || !plan || !authProvider)) {
      const profile = await readUserProfile(input.userId).catch(() => null);
      if (profile) {
        email = email ?? profile.email;
        name = name ?? profile.name;
        plan = plan ?? profile.plan;
        authProvider = authProvider ?? profile.authProvider;
      }
    }

    const loc =
      resolveUserLocationFast(request, input.clientHint ?? null) ??
      (await resolveUserLocation(request, input.clientHint ?? null));
    const traffic =
      input.traffic ??
      parseTrafficSource({
        referrer: input.referrer ?? request.headers.get("referer"),
        search: input.search,
      });
    const touch: PresenceTouch = {
      action: input.action,
      userId: input.userId,
      email,
      name,
      plan,
      authProvider,
      anonId,
      path: safePath(input.path),
      location: locationSnapshot(loc) ?? null,
      ip: clientIp(request),
      device: summarizeUserAgent(userAgent(request)),
      source: traffic.label,
      referrer: traffic.referrer,
      utmSource: traffic.utmSource,
      forceEvent: input.forceEvent,
    };
    await touchPresence(touch);
  } catch {
    /* presence must not break primary flows */
  }
}

export function clientHintFromUnknown(raw: unknown): UserLocationHint | null {
  return parseClientLocationPayload(raw);
}
