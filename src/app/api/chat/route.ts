import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/** Allow long streaming replies on Vercel (avoids abrupt "Load failed" client errors). */
export const maxDuration = 60;

import {
  noChatProvidersMessage,
  type ChatModelOption,
  type ChatProvider,
} from "@/lib/chat-models";
import { resolveChatModelForAccess } from "@/lib/plan-access";
import { resolveUserPlan, resolveUserRoles } from "@/lib/auth-guard";
import { normalizeRoles } from "@/lib/rbac";
import { openAIStreamToTextStream } from "@/lib/openai-stream";
import { inferSmileBuilderTargetFromPrompt, lastUserMessageText } from "@/lib/infer-builder-target";
import {
  getLiveOAuthIntegrationFlags,
  mergeIntegrationFlags,
} from "@/lib/oauth-connection-cookies";
import {
  applyAnonCookie,
  prepareChatRequest,
  wrapStreamWithUsageAccounting,
} from "@/lib/chat-request-guard";
import { readVerifiedSession } from "@/lib/session-cookie";
import type { AgentToolContext } from "@/lib/agent-tools/types";
import { hasAnyAgentTools } from "@/lib/agent-tools/registry";
import { streamAnthropicWithTools } from "@/lib/agent-loop";
import { parseDeviceManifest } from "@/lib/device-manifest";
import { buildIntegrationSnapshot } from "@/lib/integration-snapshot";
import {
  buildSmileSystemPrompt,
  type ChatIntegrationFlags,
  type SmileBuilderTarget,
} from "@/lib/smile-system-prompt";

type RequestAttachment = {
  name: string;
  mimeType: string;
  size: number;
  kind: "text" | "image" | "binary";
  content: string;
};

const MAX_TEXT_ATTACHMENT_CHARS_PER_FILE = 8_000;
const MAX_TEXT_ATTACHMENT_TOTAL_CHARS = 16_000;
const MAX_IMAGE_ATTACHMENTS = 1;
const MAX_REQUEST_CHAR_BUDGET = 120_000;

function parseDataUrl(input: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(input);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function estimateMessageChars(
  messages: { role: string; content: string | Array<Record<string, unknown>> }[],
): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += m.content.length;
      continue;
    }
    for (const block of m.content) {
      const textVal = (block as { text?: unknown }).text;
      if (typeof textVal === "string") total += textVal.length;
      const imageUrl = (block as { image_url?: { url?: unknown } }).image_url?.url;
      if (typeof imageUrl === "string") total += imageUrl.length;
      const sourceData = (block as { source?: { data?: unknown } }).source?.data;
      if (typeof sourceData === "string") total += sourceData.length;
    }
  }
  return total;
}

function parseIntegrationPayload(raw: unknown): Partial<ChatIntegrationFlags> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: Partial<ChatIntegrationFlags> = {};
  const wm = o.workMode;
  if (wm === "chat" || wm === "cowork" || wm === "codex") {
    out.workMode = wm;
    if (wm === "cowork") out.coworkDevice = true;
  }
  const boolKeys = [
    "coworkDevice",
    "gmail",
    "outlook",
    "googleCalendar",
    "microsoft365",
    "slack",
    "deviceFiles",
  ] as const;
  for (const k of boolKeys) {
    if (o[k] === true) out[k] = true;
  }
  if (out.workMode === "cowork") out.coworkDevice = true;
  return Object.keys(out).length ? out : null;
}

function trimMessagesToBudget(
  messages: { role: string; content: string | Array<Record<string, unknown>> }[],
  system: string,
): { role: string; content: string | Array<Record<string, unknown>> }[] {
  let trimmed = [...messages];

  // Keep recent turns first if thread gets large.
  while (trimmed.length > 8) trimmed.shift();

  const clipText = (input: string, max: number) =>
    input.length > max ? `${input.slice(0, max)}\n\n[truncated]` : input;

  trimmed = trimmed.map((m) => {
    if (typeof m.content === "string") {
      return { ...m, content: clipText(m.content, 8_000) };
    }
    const blocks = m.content.map((b) => {
      const textVal = (b as { text?: unknown }).text;
      if (typeof textVal === "string") {
        return { ...b, text: clipText(textVal, 8_000) };
      }
      return b;
    });
    return { ...m, content: blocks };
  });

  while (estimateMessageChars(trimmed) + system.length > MAX_REQUEST_CHAR_BUDGET && trimmed.length > 2) {
    trimmed.shift();
  }

  return trimmed;
}

function apiKeyFor(provider: ChatProvider): string | null {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY?.trim() || null;
    case "openai":
      return process.env.OPENAI_API_KEY?.trim() || null;
    case "groq":
      return process.env.GROQ_API_KEY?.trim() || null;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY?.trim() || null;
    case "nvidia":
      return process.env.NVIDIA_API_KEY?.trim() || null;
    default:
      return null;
  }
}

function missingKeyMessage(provider: ChatProvider): string {
  const envHint =
    " Add it in Vercel → Project → Settings → Environment Variables (Production), then redeploy.";
  switch (provider) {
    case "anthropic":
      return `Add ANTHROPIC_API_KEY to use Claude.${envHint}`;
    case "openai":
      return `Add OPENAI_API_KEY for OpenAI models.${envHint}`;
    case "groq":
      return `Add GROQ_API_KEY for Groq models.${envHint}`;
    case "openrouter":
      return `Add OPENROUTER_API_KEY for OpenRouter models.${envHint}`;
    case "nvidia":
      return `Add NVIDIA_API_KEY for NVIDIA models.${envHint}`;
    default:
      return `Missing API key for this provider.${envHint}`;
  }
}

async function streamOpenAICompatible(
  url: string,
  apiKey: string,
  option: ChatModelOption,
  system: string,
  messages: { role: string; content: string | Array<Record<string, unknown>> }[],
  extraHeaders: Record<string, string>,
): Promise<Response> {
  const openaiMessages = [
    { role: "system" as const, content: system },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string | Array<Record<string, unknown>>,
      })),
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: option.apiModel,
      messages: openaiMessages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Upstream ${res.status}: ${errText.slice(0, 800)}` },
      { status: 502 },
    );
  }

  return new Response(openAIStreamToTextStream(res), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function streamAnthropic(
  system: string,
  messages: { role: string; content: string | Array<Record<string, unknown>> }[],
  model: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const stream = anthropic.messages.stream(
            {
              model: process.env.ANTHROPIC_MODEL?.trim() || model,
              max_tokens: 8192,
              system,
              messages: messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content as any,
                })) as any,
            },
            { signal },
          );

          stream.on("text", (delta: string) => {
            controller.enqueue(encoder.encode(delta));
          });

          await stream.finalMessage();
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          const message = err instanceof Error ? err.message : "Streaming failed.";
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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    messages?: unknown;
    model?: unknown;
    attachments?: unknown;
    connectedServices?: unknown;
    deviceManifest?: unknown;
    userSession?: unknown;
  };

  const rawMessages = b.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return NextResponse.json({ error: "messages[] required" }, { status: 400 });
  }

  const messages = rawMessages.filter(
    (m): m is { role: string; content: string | Array<Record<string, unknown>> } =>
      m !== null &&
      typeof m === "object" &&
      typeof (m as { role?: unknown }).role === "string" &&
      typeof (m as { content?: unknown }).content === "string",
  );

  if (messages.length === 0) {
    return NextResponse.json({ error: "No valid messages" }, { status: 400 });
  }

  const builderTarget: SmileBuilderTarget = inferSmileBuilderTargetFromPrompt(
    lastUserMessageText(messages),
  );

  const attachments: RequestAttachment[] = Array.isArray(b.attachments)
    ? b.attachments.filter(
        (item): item is RequestAttachment =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as { name?: unknown }).name === "string" &&
          typeof (item as { mimeType?: unknown }).mimeType === "string" &&
          typeof (item as { size?: unknown }).size === "number" &&
          ((item as { kind?: unknown }).kind === "text" ||
            (item as { kind?: unknown }).kind === "image" ||
            (item as { kind?: unknown }).kind === "binary") &&
          typeof (item as { content?: unknown }).content === "string",
      )
    : [];

  const requestedId = typeof b.model === "string" ? b.model : undefined;

  const prep = await prepareChatRequest(request);
  if (!prep.ok) return prep.response;

  const { ctx } = prep;
  const roles = ctx.session ? await resolveUserRoles(ctx.session.userId) : normalizeRoles(["viewer"]);
  const plan = ctx.session ? await resolveUserPlan(ctx.session.userId) : ("free" as const);
  const option = resolveChatModelForAccess(requestedId, plan, roles);
  if (!option) {
    return NextResponse.json({ error: noChatProvidersMessage() }, { status: 503 });
  }

  if (attachments.length > 0) {
    const lastUserMessageIndex = [...messages]
      .map((m, i) => ({ role: m.role, i }))
      .reverse()
      .find((m) => m.role === "user")?.i;

    if (typeof lastUserMessageIndex === "number") {
      let usedTextChars = 0;
      const textAttachmentContext = attachments
        .filter((a) => a.kind === "text")
        .map((a, idx) => {
          const remaining = Math.max(0, MAX_TEXT_ATTACHMENT_TOTAL_CHARS - usedTextChars);
          if (remaining === 0) return "";
          const clipped = a.content.slice(
            0,
            Math.min(MAX_TEXT_ATTACHMENT_CHARS_PER_FILE, remaining),
          );
          usedTextChars += clipped.length;
          return `### Attachment ${idx + 1}: ${a.name}\nType: ${a.mimeType}\nSize: ${a.size} bytes\n\n${clipped}`;
        })
        .filter(Boolean)
        .join("\n\n");
      const binaryAttachmentContext = attachments
        .filter((a) => a.kind === "binary")
        .map(
          (a, idx) =>
            `### Binary attachment ${idx + 1}: ${a.name}\nType: ${a.mimeType}\nSize: ${a.size} bytes\nThe model cannot directly parse this binary payload here.`,
        )
        .join("\n\n");
      const imageAttachments = attachments
        .filter((a) => a.kind === "image")
        .slice(0, MAX_IMAGE_ATTACHMENTS);

      const originalContent =
        typeof messages[lastUserMessageIndex].content === "string"
          ? messages[lastUserMessageIndex].content
          : "";
      const contextParts: string[] = [];
      if (textAttachmentContext) contextParts.push(textAttachmentContext);
      if (binaryAttachmentContext) contextParts.push(binaryAttachmentContext);

      const baseInstruction = `${originalContent}

## Supporting materials
Use attached files as source of truth. If a value is unreadable or missing, say "unreadable" or "missing" instead of guessing.
`;

      if (imageAttachments.length > 0) {
        const imageBlocks = imageAttachments
          .map((img) => parseDataUrl(img.content))
          .filter((x): x is { mediaType: string; data: string } => Boolean(x));

        if (option.provider === "anthropic") {
          const blocks: Array<Record<string, unknown>> = [
            {
              type: "text",
              text: `${baseInstruction}\n${contextParts.join("\n\n")}`.trim(),
            },
            ...imageBlocks.map((img) => ({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType,
                data: img.data,
              },
            })),
          ];
          messages[lastUserMessageIndex] = {
            ...messages[lastUserMessageIndex],
            content: blocks,
          };
        } else {
          const blocks: Array<Record<string, unknown>> = [
            {
              type: "text",
              text: `${baseInstruction}\n${contextParts.join("\n\n")}`.trim(),
            },
            ...imageBlocks.map((img) => ({
              type: "image_url",
              image_url: {
                url: `data:${img.mediaType};base64,${img.data}`,
                detail: "high",
              },
            })),
          ];
          messages[lastUserMessageIndex] = {
            ...messages[lastUserMessageIndex],
            content: blocks,
          };
        }
      } else {
        messages[lastUserMessageIndex] = {
          ...messages[lastUserMessageIndex],
          content: `${baseInstruction}\n${contextParts.join("\n\n")}`.trim(),
        };
      }
    }
  }

  const key = apiKeyFor(option.provider);
  if (!key) {
    return NextResponse.json(
      { error: missingKeyMessage(option.provider) },
      { status: 503 },
    );
  }

  const verified = ctx.session;
  const serverOAuthFlags = await getLiveOAuthIntegrationFlags(request);
  const integrationFlags = mergeIntegrationFlags(
    parseIntegrationPayload(b.connectedServices),
    serverOAuthFlags,
    Boolean(verified),
  );
  const deviceManifest =
    verified && integrationFlags?.deviceFiles
      ? parseDeviceManifest(b.deviceManifest)
      : null;
  let effectiveBuilderTarget = builderTarget;
  if (integrationFlags?.workMode === "codex" && effectiveBuilderTarget === "general") {
    effectiveBuilderTarget = "application";
  }
  if (integrationFlags?.workMode === "cowork" && effectiveBuilderTarget === "general") {
    effectiveBuilderTarget = "workflow";
  }
  const userSession = verified ? { email: verified.email, name: verified.name } : undefined;
  const agentCtx: AgentToolContext = {
    request,
    flags: integrationFlags ?? {},
    deviceManifest,
  };
  const agentToolsAvailable = await hasAnyAgentTools(agentCtx);
  let system = buildSmileSystemPrompt(effectiveBuilderTarget, integrationFlags, userSession, {
    agentToolsEnabled: agentToolsAvailable,
  });
  if (!agentToolsAvailable) {
    system += await buildIntegrationSnapshot(request, integrationFlags);
  }
  if (deviceManifest?.entries.length) {
    system += `\n\n## Device folder indexed\n${deviceManifest.entries.length} paths under "${deviceManifest.rootName}". Use list_device_files / read_device_file when answering file questions.`;
  }
  const budgetedMessages = trimMessagesToBudget(messages, system);
  const estimatedChars = estimateMessageChars(budgetedMessages) + system.length;
  if (estimatedChars > MAX_REQUEST_CHAR_BUDGET) {
    return NextResponse.json(
      {
        error:
          "Prompt is too large for this model. Try fewer/lower-resolution attachments or shorter text.",
      },
      { status: 400 },
    );
  }

  const modelId = option.id;
  const usageOpts = {
    modelId,
    inputChars: estimatedChars,
    session: ctx.session,
    anonId: ctx.anonId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  };

  const finish = (res: Response) =>
    applyAnonCookie(wrapStreamWithUsageAccounting(res, usageOpts), ctx.anonCookieToSet);

  try {
    switch (option.provider) {
      case "anthropic":
        if (agentToolsAvailable) {
          return finish(
            await streamAnthropicWithTools(
              key,
              option.apiModel,
              system,
              budgetedMessages,
              agentCtx,
              request.signal,
            ),
          );
        }
        return finish(
          await streamAnthropic(system, budgetedMessages, option.apiModel, key, request.signal),
        );
      case "openai":
        return finish(
          await streamOpenAICompatible(
            "https://api.openai.com/v1/chat/completions",
            key,
            option,
            system,
            budgetedMessages,
            {},
          ),
        );
      case "groq":
        return finish(
          await streamOpenAICompatible(
            "https://api.groq.com/openai/v1/chat/completions",
            key,
            option,
            system,
            budgetedMessages,
            {},
          ),
        );
      case "openrouter":
        return finish(
          await streamOpenAICompatible(
            "https://openrouter.ai/api/v1/chat/completions",
            key,
            option,
            system,
            budgetedMessages,
            {
              "HTTP-Referer": process.env.OPENROUTER_REFERER?.trim() || "http://localhost:3010",
              "X-Title": "FIGHURAI",
            },
          ),
        );
      case "nvidia":
        return finish(
          await streamOpenAICompatible(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            key,
            option,
            system,
            budgetedMessages,
            {},
          ),
        );
      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 500 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
