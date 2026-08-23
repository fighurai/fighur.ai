import { parseClientLocationPayload, type UserLocationHint } from "@/lib/client-location";
import {
  locationSnapshot,
  touchPresence,
  type PresenceAction,
  type PresenceTouch,
} from "@/lib/presence-store";
import { clientIp, userAgent } from "@/lib/request-context";
import { resolveUserLocation } from "@/lib/resolve-user-location";
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

export async function recordPresence(request: Request, input: RecordPresenceInput): Promise<void> {
  try {
    if (!input.userId && !input.anonId) return;

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

    const loc = await resolveUserLocation(request, input.clientHint ?? null);
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
      anonId: input.anonId,
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
