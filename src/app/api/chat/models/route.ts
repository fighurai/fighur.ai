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
import { AUTO_MODEL_ID } from "@/lib/route-llm";
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
  const allModelsAccess = hasAllModelsAccess(plan, roles);

  const catalog = CHAT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: (availability[m.id] ?? false) && allowed.has(m.id),
    includedInPlan: allowed.has(m.id),
  }));

  const chatReady = catalog.some((m) => m.available);

  // Auto (RouteLLM) — available whenever at least one real model is ready.
  // Free plan still only routes within the allowlist (Claude today).
  const models = [
    {
      id: AUTO_MODEL_ID,
      label: allModelsAccess ? "Auto (RouteLLM)" : "Auto",
      provider: "auto",
      available: chatReady,
      includedInPlan: true,
    },
    ...catalog,
  ];

  const clientPlan = session ? (allModelsAccess ? "pro" : "free") : "trial";

  return NextResponse.json({
    models,
    defaultModel: chatReady
      ? AUTO_MODEL_ID
      : allowed.has(FREE_TIER_MODEL_ID) && availability[FREE_TIER_MODEL_ID]
        ? FREE_TIER_MODEL_ID
        : pickDefaultModelId(),
    chatReady,
    configuredProviders,
    signedIn: Boolean(session),
    plan: clientPlan,
    freeTierModelId: FREE_TIER_MODEL_ID,
    autoModelId: AUTO_MODEL_ID,
    setupHint: chatReady
      ? undefined
      : "Add ANTHROPIC_API_KEY in Vercel for Claude (required for free accounts), then redeploy.",
  });
}
