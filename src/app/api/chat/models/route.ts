import { NextResponse } from "next/server";

import { resolveUserRoles } from "@/lib/auth-guard";
import { normalizeRoles, type Role } from "@/lib/rbac";
import {
  CHAT_MODEL_OPTIONS,
  getChatModelAvailability,
  listConfiguredProviders,
  pickDefaultModelId,
} from "@/lib/chat-models";
import {
  allowedModelIdsForRoles,
  FREE_TIER_MODEL_ID,
  isFullModelAccess,
} from "@/lib/plan-access";
import { readVerifiedSession } from "@/lib/session-cookie";

export async function GET(request: Request) {
  const availability = getChatModelAvailability();
  const configuredProviders = listConfiguredProviders();
  const session = await readVerifiedSession(request);
  const roles: Role[] = session ? await resolveUserRoles(session.userId) : normalizeRoles(["viewer"]);
  const allowed = new Set(allowedModelIdsForRoles(roles));

  const models = CHAT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: (availability[m.id] ?? false) && allowed.has(m.id),
    includedInPlan: allowed.has(m.id),
  }));

  const chatReady = models.some((m) => m.available);
  const defaultModel =
    allowed.has(FREE_TIER_MODEL_ID) && availability[FREE_TIER_MODEL_ID]
      ? FREE_TIER_MODEL_ID
      : pickDefaultModelId();

  return NextResponse.json({
    models,
    defaultModel,
    chatReady,
    configuredProviders,
    signedIn: Boolean(session),
    plan: session ? (isFullModelAccess(roles) ? "full" : "free") : "trial",
    freeTierModelId: FREE_TIER_MODEL_ID,
    setupHint: chatReady
      ? undefined
      : "Add ANTHROPIC_API_KEY in Vercel for Claude (required for free accounts), then redeploy.",
  });
}
