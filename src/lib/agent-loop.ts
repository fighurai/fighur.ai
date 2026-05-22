import Anthropic from "@anthropic-ai/sdk";

import { availableAgentTools } from "@/lib/agent-tools/registry";
import { executeAgentTool } from "@/lib/agent-tools/execute";
import type { AgentToolContext } from "@/lib/agent-tools/types";
import type { DeviceOpsPayload } from "@/lib/device-ops-parse";
import { formatDeviceOpsFence } from "@/lib/device-ops-parse";

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

/** Anthropic streaming chat with tool loop (CoWork / Codex integrations). */
export async function streamAnthropicWithTools(
  apiKey: string,
  model: string,
  system: string,
  messages: SimpleMessage[],
  ctx: AgentToolContext,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const tools = await availableAgentTools(ctx);
  if (tools.length === 0) {
    throw new Error("No agent tools available");
  }

  const anthropic = new Anthropic({ apiKey });
  const resolvedModel = process.env.ANTHROPIC_MODEL?.trim() || model;
  const encoder = new TextEncoder();
  let conversation = toAnthropicMessages(messages);
  let pendingDeviceOps: DeviceOpsPayload | null = null;

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const stream = anthropic.messages.stream(
              {
                model: resolvedModel,
                max_tokens: 8192,
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

            stream.on("text", (delta: string) => {
              controller.enqueue(encoder.encode(delta));
            });

            const final = await stream.finalMessage();
            const toolUses = final.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );

            if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
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
              const input =
                tu.input && typeof tu.input === "object"
                  ? (tu.input as Record<string, unknown>)
                  : {};
              const result = await executeAgentTool(tu.name, input, ctx);
              if (result.deviceOps) {
                pendingDeviceOps = result.deviceOps;
                controller.enqueue(
                  encoder.encode(
                    "\n\n### Organize files on this device\nAn **Apply** popup will open (or is already open). Click **Apply** to run the plan. **Do not use Terminal.**\n",
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
      },
    },
  );
}
