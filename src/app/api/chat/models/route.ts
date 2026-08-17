import { NextResponse } from "next/server";

import { resolveUserPlan, resolveUserRoles } from "@/lib/auth-guard";
import {
  getChatModelAvailability,
  listConfiguredProviders,
  pickDefaultModelId,
} from "@/lib/chat-models";
import {
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
  const allModelsAccess = hasAllModelsAccess(plan, roles);

  const claudeReady = Boolean(availability[FREE_TIER_MODEL_ID]);
  const chatReady = claudeReady;

  // Single picker option: Auto → Claude Sonnet 4.5 under the hood.
  const models = [
    {
      id: AUTO_MODEL_ID,
      label: "Auto",
      provider: "auto",
      available: chatReady,
      includedInPlan: true,
    },
  ];

  const clientPlan = session ? (allModelsAccess ? "pro" : "free") : "trial";

  return NextResponse.json({
    models,
    defaultModel: chatReady ? AUTO_MODEL_ID : pickDefaultModelId(),
    chatReady,
    configuredProviders,
    signedIn: Boolean(session),
    plan: clientPlan,
    freeTierModelId: FREE_TIER_MODEL_ID,
    autoModelId: AUTO_MODEL_ID,
    setupHint: undefined,
  });
}
