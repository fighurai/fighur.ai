import { NextResponse } from "next/server";

import { resolveUserPlan, resolveUserRoles } from "@/lib/auth-guard";
import {
  CHAT_MODEL_OPTIONS,
  getChatModelAvailability,
  listConfiguredProviders,
  pickDefaultModelId,
} from "@/lib/chat-models";
import {
  allowedModelIdsForPlan,
  FREE_TIER_MODEL_ID,
  hasAllModelsAccess,
} from "@/lib/plan-access";
import { normalizeRoles, type Role } from "@/lib/rbac";
import { readVerifiedSession } from "@/lib/session-cookie";
export async function GET(request: Request) {
  const availability = getChatModelAvailability();
  const configuredProviders = listConfiguredProviders();
  const session = await readVerifiedSession(request);
  const roles: Role[] = session
    ? await resolveUserRoles(session.userId, session)
    : normalizeRoles(["viewer"]);
  const plan = session ? await resolveUserPlan(session.userId, session) : ("free" as const);
  const allowed = new Set(allowedModelIdsForPlan(plan, roles));

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

  const clientPlan = session
    ? hasAllModelsAccess(plan, roles)
      ? "pro"
      : "free"
    : "trial";

  return NextResponse.json({
    models,
    defaultModel,
    chatReady,
    configuredProviders,
    signedIn: Boolean(session),
    plan: clientPlan,
    freeTierModelId: FREE_TIER_MODEL_ID,
    setupHint: chatReady
      ? undefined
      : "Add ANTHROPIC_API_KEY in Vercel for Claude (required for free accounts), then redeploy.",
  });
}
