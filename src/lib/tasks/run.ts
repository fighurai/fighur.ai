import Anthropic from "@anthropic-ai/sdk";

import { resolveUserPlan, resolveUserRoles } from "@/lib/auth-guard";
import { resolveChatModelForAccess } from "@/lib/plan-access";
import { resolveChatModelOption, type ChatProvider } from "@/lib/chat-models";
import { estimateUsageCostUsd } from "@/lib/token-pricing";
import { recordUserUsage } from "@/lib/usage-wallet";
import { readUserPreferences } from "@/lib/user-preferences-store";
import { buildTaskLiveContext } from "@/lib/tasks/live-context";
import { saveTaskConversation } from "@/lib/tasks/save-conversation";
import {
  claimManagedTask,
  recordTaskRunResult,
  scheduleOptionsFromTask,
  type ManagedTask,
} from "@/lib/tasks/store";
import { computeNextRunAt, formatNowInTimeZone, scheduleLabel } from "@/lib/tasks/schedule";

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

function openAiCompatibleUrl(provider: ChatProvider): string | null {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "nvidia":
      return (
        process.env.NVIDIA_BASE_URL?.trim() ||
        "https://integrate.api.nvidia.com/v1/chat/completions"
      );
    default:
      return null;
  }
}

async function completeOnce(opts: {
  provider: ChatProvider;
  apiModel: string;
  apiKey: string;
  system: string;
  user: string;
}): Promise<string> {
  if (opts.provider === "anthropic") {
    const client = new Anthropic({ apiKey: opts.apiKey });
    const msg = await client.messages.create({
      model: opts.apiModel,
      max_tokens: 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Empty Anthropic response");
    return text;
  }

  const url = openAiCompatibleUrl(opts.provider);
  if (!url) throw new Error(`Unsupported provider: ${opts.provider}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
  };
  if (opts.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://fighur.ai";
    headers["X-Title"] = "FIGHURAI Tasks";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.apiModel,
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Model error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}

export type TaskRunOutcome = {
  userId: string;
  taskId: string;
  status: "ok" | "error" | "skipped";
  detail: string;
  conversationId?: string;
};

/**
 * Claim + run a scheduled task.
 * Injects the real local date, live web search for news-style prompts, and
 * saves the result as a sidebar conversation.
 */
export async function runScheduledTask(
  userId: string,
  taskId: string,
): Promise<TaskRunOutcome> {
  const claimed = await claimManagedTask(userId, taskId);
  if (!claimed) {
    return { userId, taskId, status: "skipped", detail: "Task missing or disabled" };
  }

  const scheduleOpts = scheduleOptionsFromTask(claimed);
  const nextRunAt = claimed.nextRunAt || computeNextRunAt(claimed.schedule, new Date(), scheduleOpts);

  try {
    const plan = await resolveUserPlan(userId);
    const roles = await resolveUserRoles(userId);
    const option =
      resolveChatModelForAccess(undefined, plan, roles) || resolveChatModelOption(null);
    if (!option) {
      await recordTaskRunResult(userId, taskId, {
        status: "error",
        text: "No model API keys configured on the server.",
        nextRunAt,
      });
      return { userId, taskId, status: "error", detail: "No model keys" };
    }

    const key = apiKeyFor(option.provider);
    if (!key) {
      await recordTaskRunResult(userId, taskId, {
        status: "error",
        text: `Missing API key for ${option.provider}`,
        nextRunAt,
      });
      return { userId, taskId, status: "error", detail: "Missing API key" };
    }

    const prefs = await readUserPreferences(userId);
    const now = new Date();
    const clock = formatNowInTimeZone(now, scheduleOpts.timeZone || "America/New_York");
    const live = await buildTaskLiveContext({
      prompt: claimed.prompt,
      monthDayYear: clock.monthDayYear,
      isoDate: clock.isoDate,
    });

    const system = [
      "You are FIGHURAI running a scheduled task for the signed-in user.",
      `The current date and time is ${clock.longLabel}.`,
      `ISO date: ${clock.isoDate}.`,
      'Use this date in titles and copy. Never invent another "today" (for example January 2025) and never use your training cutoff as the current date.',
      "Complete the task thoroughly. Write the full deliverable — this reply is saved as a chat conversation.",
      live
        ? "A LIVE WEB SEARCH block is included. For news, headlines, or “latest” requests, ground every factual claim in that block and cite URLs. Do not pad with generic industry landscape copy."
        : "No live search block was attached. If the task needs current events, say you could not fetch headlines instead of inventing them.",
      prefs.behaviorInstructions.trim()
        ? `\nBehavior instructions:\n${prefs.behaviorInstructions.trim()}`
        : prefs.customInstructions.trim()
          ? `\nUser custom instructions:\n${prefs.customInstructions.trim()}`
          : "",
      prefs.responseInstructions.trim()
        ? `\nResponse instructions:\n${prefs.responseInstructions.trim()}`
        : "",
      prefs.deepResearch.enabled
        ? `\nDeep research preference is on${prefs.deepResearch.citeSources ? " (cite sources)" : ""}.`
        : "",
      live,
    ]
      .filter(Boolean)
      .join("\n");

    const user = [
      `Scheduled task: ${claimed.name}`,
      "",
      claimed.prompt,
      "",
      `Today's date is ${clock.monthDayYear} (${clock.isoDate}). Start any dated title from this date.`,
    ].join("\n");

    const text = await completeOnce({
      provider: option.provider,
      apiModel: option.apiModel,
      apiKey: key,
      system,
      user,
    });

    await recordUserUsage(userId, {
      costUsd: estimateUsageCostUsd(option.id, system.length + user.length, text.length),
      inputChars: system.length + user.length,
      outputChars: text.length,
    });

    let conversationId: string | undefined;
    try {
      conversationId = await saveTaskConversation({
        userId,
        taskId,
        taskName: claimed.name,
        prompt: claimed.prompt,
        result: text,
        isoDate: clock.isoDate,
        dateLabel: clock.monthDayYear,
      });
    } catch (e) {
      conversationId = undefined;
      console.error("task conversation save failed", e);
    }

    await recordTaskRunResult(userId, taskId, {
      status: "ok",
      text,
      nextRunAt,
      conversationId,
    });

    return {
      userId,
      taskId,
      status: "ok",
      detail: text.slice(0, 200),
      conversationId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Task run failed";
    await recordTaskRunResult(userId, taskId, {
      status: "error",
      text: msg,
      nextRunAt,
    });
    return { userId, taskId, status: "error", detail: msg };
  }
}

export async function runDueTasks(limit = 5): Promise<TaskRunOutcome[]> {
  const { listDueScheduleEntries } = await import("@/lib/tasks/index");
  const due = await listDueScheduleEntries(new Date(), limit);
  const outcomes: TaskRunOutcome[] = [];
  for (const entry of due) {
    outcomes.push(await runScheduledTask(entry.userId, entry.taskId));
  }
  return outcomes;
}

/** Public summary fields for Settings / tools. */
export function taskSummary(task: ManagedTask) {
  const opts = scheduleOptionsFromTask(task);
  return {
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    scheduleLabel: scheduleLabel(task.schedule, opts),
    timeZone: opts.timeZone,
    hour: opts.hour,
    minute: opts.minute,
    enabled: task.enabled,
    nextRunAt: task.nextRunAt,
    lastRunAt: task.lastRunAt,
    lastStatus: task.lastStatus,
    lastResultPreview: task.lastResult?.slice(0, 280),
    lastConversationId: task.lastConversationId ?? null,
  };
}

/** Full task fields for the settings management page. */
export function taskDetail(task: ManagedTask) {
  return {
    ...taskSummary(task),
    prompt: task.prompt,
    lastResult: task.lastResult ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
