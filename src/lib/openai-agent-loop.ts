import { availableAgentTools } from "@/lib/agent-tools/registry";
import { executeAgentTool } from "@/lib/agent-tools/execute";
import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent-tools/types";
import type { DeviceOpsPayload } from "@/lib/device-ops-parse";
import { formatDeviceOpsFence } from "@/lib/device-ops-parse";
import { openAIStreamToTextStream } from "@/lib/openai-stream";

const MAX_TOOL_ROUNDS = 8;

type SimpleMessage = {
  role: string;
  content: string | Array<Record<string, unknown>>;
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function toOpenAITools(tools: AgentToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function toOpenAIMessages(
  system: string,
  messages: SimpleMessage[],
): Array<Record<string, unknown>> {
  return [
    { role: "system", content: system },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role,
        content: m.content,
      })),
  ];
}

async function chatCompletion(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * OpenAI-compatible tool loop (OpenAI / Groq / OpenRouter / NVIDIA).
 * Streams the final answer as plain text after tool rounds complete.
 */
export async function streamOpenAIWithTools(opts: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  messages: SimpleMessage[];
  ctx: AgentToolContext;
  signal?: AbortSignal;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;
}): Promise<Response> {
  const tools = await availableAgentTools(opts.ctx);
  if (tools.length === 0) {
    throw new Error("No agent tools available");
  }

  const encoder = new TextEncoder();
  const openaiTools = toOpenAITools(tools);
  let conversation = toOpenAIMessages(opts.system, opts.messages);
  let pendingDeviceOps: DeviceOpsPayload | null = null;
  const maxTokens = opts.maxTokens ?? 8192;
  const extraHeaders = opts.extraHeaders ?? {};

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const res = await chatCompletion(
              opts.url,
              opts.apiKey,
              {
                model: opts.model,
                messages: conversation,
                tools: openaiTools,
                tool_choice: "auto",
                stream: false,
                max_tokens: maxTokens,
                temperature: 0.7,
              },
              extraHeaders,
              opts.signal,
            );

            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              controller.enqueue(
                encoder.encode(`\n\n_Upstream ${res.status}: ${errText.slice(0, 500)}_`),
              );
              return;
            }

            const json = (await res.json()) as {
              choices?: Array<{
                message?: {
                  role?: string;
                  content?: string | null;
                  tool_calls?: OpenAIToolCall[];
                };
                finish_reason?: string;
              }>;
            };

            const message = json.choices?.[0]?.message;
            if (!message) {
              controller.enqueue(encoder.encode("\n\n_Empty model response._"));
              return;
            }

            const toolCalls = message.tool_calls ?? [];
            if (toolCalls.length === 0) {
              const text = typeof message.content === "string" ? message.content : "";
              if (text) controller.enqueue(encoder.encode(text));
              if (pendingDeviceOps) {
                controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
              }
              return;
            }

            conversation = [
              ...conversation,
              {
                role: "assistant",
                content: message.content ?? null,
                tool_calls: toolCalls,
              },
            ];

            for (const tc of toolCalls) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
              } catch {
                args = {};
              }
              const result = await executeAgentTool(tc.function.name, args, opts.ctx);
              if (result.deviceOps) {
                pendingDeviceOps = result.deviceOps;
                controller.enqueue(
                  encoder.encode(
                    "\n\n### Organize files on this device\nAn **Apply** popup will open. Click **Apply** to run the plan. **Do not use Terminal.**\n",
                  ),
                );
                controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
                return;
              }
              conversation.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result.content,
              });
            }
          }

          // Final streaming pass without tools if we exhausted rounds mid-loop
          const finalRes = await chatCompletion(
            opts.url,
            opts.apiKey,
            {
              model: opts.model,
              messages: conversation,
              stream: true,
              max_tokens: maxTokens,
              temperature: 0.7,
            },
            extraHeaders,
            opts.signal,
          );
          if (finalRes.ok && finalRes.body) {
            const textStream = openAIStreamToTextStream(finalRes);
            const reader = textStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } else {
            controller.enqueue(
              encoder.encode("\n\n_Reached tool round limit; answer may be incomplete._"),
            );
          }
          if (pendingDeviceOps) {
            controller.enqueue(encoder.encode(formatDeviceOpsFence(pendingDeviceOps)));
          }
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
