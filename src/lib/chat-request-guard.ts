import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { checkChatAccess } from "@/lib/auth-guard";
import {
  anonymousCookieOptions,
  createAnonymousId,
  readAnonymousId,
  sealAnonymousId,
} from "@/lib/anonymous-session";
import { clientIp, userAgent } from "@/lib/request-context";
import { readVerifiedSession, type SmileServerSession } from "@/lib/session-cookie";
import { trackPlainTextStream } from "@/lib/stream-usage";
import { estimateUsageCostUsd } from "@/lib/token-pricing";
import { recordAnonymousUsage, recordUserUsage } from "@/lib/usage-wallet";

export type ChatRequestContext = {
  session: SmileServerSession | null;
  anonId: string | null;
  anonCookieToSet: string | null;
  ip: string;
  userAgent: string;
};

export async function prepareChatRequest(request: Request): Promise<
  | { ok: true; ctx: ChatRequestContext }
  | { ok: false; response: NextResponse }
> {
  const ip = clientIp(request);
  const ua = userAgent(request);
  const session = await readVerifiedSession(request);
  let anonId = readAnonymousId(request);
  let anonCookieToSet: string | null = null;

  if (!session && !anonId) {
    anonId = createAnonymousId();
    anonCookieToSet = sealAnonymousId(anonId);
  }

  const access = await checkChatAccess(session, anonId);
  if (!access.allowed) {
    await appendAudit({
      action: "chat.denied",
      outcome: "denied",
      userId: session?.userId,
      anonId: anonId ?? undefined,
      ip,
      userAgent: ua,
      meta: { code: access.code },
    });
    const status = access.code === "FORBIDDEN" ? 403 : 402;
    const res = NextResponse.json(
      {
        error: access.message,
        code: access.code,
        signupRequired: access.code === "USAGE_LIMIT" || access.code === "SIGNUP_REQUIRED",
        spentUsd: access.spentUsd,
        limitUsd: access.limitUsd,
      },
      { status },
    );
    if (anonCookieToSet) {
      res.cookies.set("smile_anon", anonCookieToSet, anonymousCookieOptions());
    }
    return { ok: false, response: res };
  }

  await appendAudit({
    action: "chat.request",
    outcome: "success",
    userId: access.userId,
    anonId: access.anonId,
    ip,
    userAgent: ua,
  });

  return {
    ok: true,
    ctx: { session, anonId, anonCookieToSet, ip, userAgent: ua },
  };
}

export function applyAnonCookie(res: Response, anonCookieToSet: string | null): Response {
  if (!anonCookieToSet) return res;
  const headers = new Headers(res.headers);
  const secure = process.env.NODE_ENV === "production";
  const cookie = `smile_anon=${encodeURIComponent(anonCookieToSet)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure ? "; Secure" : ""}`;
  headers.append("Set-Cookie", cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function wrapStreamWithUsageAccounting(
  response: Response,
  opts: {
    modelId: string;
    inputChars: number;
    session: SmileServerSession | null;
    anonId: string | null;
    ip: string;
    userAgent: string;
  },
): Response {
  const body = response.body;
  if (!body) return response;

  const tracked = trackPlainTextStream(body, (outputChars) => {
    void (async () => {
      const costUsd = estimateUsageCostUsd(opts.modelId, opts.inputChars, outputChars);
      try {
        if (opts.session) {
          await recordUserUsage(opts.session.userId, {
            costUsd,
            inputChars: opts.inputChars,
            outputChars,
          });
        } else if (opts.anonId) {
          await recordAnonymousUsage(opts.anonId, {
            costUsd,
            inputChars: opts.inputChars,
            outputChars,
          });
        }
        await appendAudit({
          action: "chat.complete",
          outcome: "success",
          userId: opts.session?.userId,
          anonId: opts.anonId ?? undefined,
          ip: opts.ip,
          userAgent: opts.userAgent,
          meta: { modelId: opts.modelId, costUsd, outputChars },
        });
      } catch {
        /* non-fatal */
      }
    })();
  });

  return new Response(tracked, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
