import { NextResponse } from "next/server";

import {
  CHAT_MODEL_OPTIONS,
  getChatModelAvailability,
  pickDefaultModelId,
} from "@/lib/chat-models";

export async function GET() {
  const availability = getChatModelAvailability();
  const models = CHAT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    available: availability[m.id] ?? false,
  }));
  return NextResponse.json({
    models,
    defaultModel: pickDefaultModelId(),
  });
}
