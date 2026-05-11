import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { PROMPTIFY_SMILE_SYSTEM } from "@/lib/promptify-smile-system";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    system: PROMPTIFY_SMILE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Rewrite the following into one clear message for a general AI assistant:\n\n---\n${text}\n---`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const onText = (delta: string) => {
        controller.enqueue(encoder.encode(delta));
      };
      stream.on("text", onText);
      try {
        await stream.finalMessage();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Promptify failed.";
        controller.enqueue(encoder.encode(`\n[Error] ${message}`));
      } finally {
        stream.off("text", onText);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
