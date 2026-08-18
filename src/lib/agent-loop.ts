import Anthropic from "@anthropic-ai/sdk";

import { availableAgentTools } from "@/lib/agent-tools/registry";
import { executeAgentTool } from "@/lib/agent-tools/execute";
import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent-tools/types";
import type { DeviceOpsPayload } from "@/lib/device-ops-parse";
import { formatDeviceOpsFence } from "@/lib/device-ops-parse";
import {
  CONTINUE_OUTPUT_PROMPT,
  isOutputTruncated,
  MAX_OUTPUT_CONTINUES,
} from "@/lib/stream-continue";

const MAX_TOOL_ROUNDS = 8;

type SimpleMessage = {
  role: string;
  content: string | Array<Record<string, unknown>>;
};

function toAnthropicMessages(
  messages: SimpleMessage[],
): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as Anthropic.MessageParam["content"],
    }));
}

function toolStatusLine(name: string): string {
  switch (name) {
    case "web_search":
      return "\n_Searching…_\n";
    case "fetch_url":
      return "\n_Reading…_\n";
    case "get_weather":
      return "\n_Checking weather…_\n";
    case "generate_artifact":
      return "";
    default:
      return `\n_Using ${name}…_\n`;
  }
}

function enqueueToolStatus(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  name: string,
  announced: Set<string>,
) {
  const key =
    name === "web_search" || name === "fetch_url" ? `research:${name}` : name;
  if (announced.has(key)) return;
  announced.add(key);
  const line = toolStatusLine(name);
  if (line) controller.enqueue(encoder.encode(line));
}

/** Anthropic streaming chat with tool loop (CoWork / Codex integrations). */
export async function streamAnthropicWithTools(
  apiKey: string,
  model: string,
  system: string,
  messages: SimpleMessage[],
  ctx: AgentToolContext,
  signal: AbortSignal | undefined,
  maxTokens = 8192,
  preloadedTools?: AgentToolDefinition[],
): Promise<Response> {
  const tools = preloadedTools ?? (await availableAgentTools(ctx));
  if (tools.length === 0) {
    throw new Error("No agent tools available");
  }

  const anthropic = new Anthropic({ apiKey });
  const resolvedModel = process.env.ANTHROPIC_MODEL?.trim() || model;
  const encoder = new TextEncoder();
  let conversation = toAnthropicMessages(messages);
  let pendingDeviceOps: DeviceOpsPayload | null = null;
  const announcedTools = new Set<string>();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          // Kick the body so proxies/clients don't sit on an empty stream.
          controller.enqueue(encoder.encode("\n"));
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const stream = anthropic.messages.stream(
              {
                model: resolvedModel,
                max_tokens: maxTokens,
                temperature: 1,
                system,
                messages: conversation,
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.input_schema as Anthropic.Tool["input_schema"],
                })),
              },
              { signal },
            );

            let roundText = "";
            stream.on("text", (delta: string) => {
              roundText += delta;
              controller.enqueue(encoder.encode(delta));
            });

            const final = await stream.finalMessage();
            const toolUses = final.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );

            if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
              // Hit output ceiling mid-document — keep generating without tools.
              let fullAssistant = roundText;
              let stopReason = final.stop_reason;
              for (
                let c = 0;
                c < MAX_OUTPUT_CONTINUES && isOutputTruncated(stopReason);
                c++
              ) {
                const contStream = anthropic.messages.stream(
                  {
                    model: resolvedModel,
                    max_tokens: maxTokens,
                    temperature: 1,
                    system,
                    messages: [
                      ...conversation,
                      { role: "assistant", content: fullAssistant },
                      { role: "user", content: CONTINUE_OUTPUT_PROMPT },
                    ],
                  },
                  { signal },
                );
                let piece = "";
                contStream.on("text", (delta: string) => {
                  piece += delta;
                  controller.enqueue(encoder.encode(delta));
                });
                const contFinal = await contStream.finalMessage();
                fullAssistant += piece;
                stopReason = contFinal.stop_reason;
              }
              if (pendingDeviceOps) {
                controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
              }
              return;
            }

            conversation = [
              ...conversation,
              { role: "assistant", content: final.content },
            ];

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              enqueueToolStatus(controller, encoder, tu.name, announcedTools);
              const input =
                tu.input && typeof tu.input === "object"
                  ? (tu.input as Record<string, unknown>)
                  : {};
              const result = await executeAgentTool(tu.name, input, ctx);
              if (result.deviceOps) {
                pendingDeviceOps = result.deviceOps;
                controller.enqueue(
                  encoder.encode(
                    "\n\n**Organize files on this device**\nAn **Apply** popup will open (or is already open). Click **Apply** to run the plan. **Do not use Terminal.**\n",
                  ),
                );
                controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
                return;
              }
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result.content,
                is_error: result.isError,
              });
            }

            conversation = [
              ...conversation,
              { role: "user", content: toolResults },
            ];
          }

          if (pendingDeviceOps) {
            controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
          }
          controller.enqueue(
            encoder.encode("\n\n_Reached tool round limit; answer may be incomplete._"),
          );
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          const message = err instanceof Error ? err.message : "Agent failed.";
          controller.enqueue(encoder.encode(`\n\n_${message}_`));
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
