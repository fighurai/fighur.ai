import { NextResponse } from "next/server";

import {
  CHAT_MODEL_OPTIONS,
  getChatModelAvailability,
  listConfiguredProviders,
  pickDefaultModelId,
} from "@/lib/chat-models";

export async function GET() {
  const availability = getChatModelAvailability();
  const configuredProviders = listConfiguredProviders();
  const models = CHAT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: availability[m.id] ?? false,
  }));
  const chatReady = configuredProviders.length > 0;
  return NextResponse.json({
    models,
    defaultModel: pickDefaultModelId(),
    chatReady,
    configuredProviders,
    setupHint: chatReady
      ? undefined
      : "Add at least one API key in Vercel for this project (fighur.ai): ANTHROPIC_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY — Production environment, then Redeploy.",
  });
}
