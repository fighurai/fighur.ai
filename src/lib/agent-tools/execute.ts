import {
  listGmailRecent,
  listGoogleCalendarUpcoming,
} from "@/lib/integrations/google-api";
import {
  listMicrosoftCalendarUpcoming,
  listOutlookRecent,
} from "@/lib/integrations/microsoft-api";
import { fetchWebPage } from "@/lib/integrations/fetch-url";
import {
  generateImage,
  imageResultToMarkdown,
} from "@/lib/integrations/image-generation-api";
import { runSandboxedCode } from "@/lib/integrations/code-exec";
import { generateArtifact } from "@/lib/integrations/generate-artifact";
import { fetchWeather, fetchWeatherAtCoordinates } from "@/lib/integrations/weather-api";
import { searchWeb } from "@/lib/integrations/web-search-api";
import {
  createManagedApp,
  publishManagedApp,
  unpublishManagedApp,
} from "@/lib/apps/store";
import {
  createManagedAgent,
  deleteManagedAgent,
  getAgentStore,
  setActiveManagedAgent,
  updateManagedAgent,
  type AgentEffort,
} from "@/lib/agents/store";
import {
  createManagedTask,
  deleteManagedTask,
  listManagedTasks,
} from "@/lib/tasks/store";
import { isTaskSchedulePreset } from "@/lib/tasks/schedule";
import { taskSummary } from "@/lib/tasks/run";
import type { AgentToolContext, AgentToolResult } from "@/lib/agent-tools/types";
import { deviceOpsFromToolInput } from "@/lib/device-ops-parse";
import { manifestSummary } from "@/lib/device-manifest";
import { executeMcpAgentTool } from "@/lib/mcp/tools";
import { emptyMcpConfig } from "@/lib/mcp/types";
import { getGoogleAccessToken, getMicrosoftAccessToken } from "@/lib/oauth-token";

function clampMax(n: unknown, fallback = 8): number {
  const v = typeof n === "number" ? n : fallback;
  return Math.min(15, Math.max(1, Math.floor(v)));
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  try {
    switch (name) {
      case "get_weather": {
        let location = typeof input.location === "string" ? input.location.trim() : "";
        const useHere = !location || /^(here|my\s*(city|location|area)|local|current\s*location)$/i.test(location);

        if (useHere && ctx.userLocation) {
          const { latitude, longitude, city, source } = ctx.userLocation;
          // Only trust browser GPS for "here" — IP/CDN metros (e.g. Atlanta) are often wrong.
          if (source === "browser") {
            if (latitude !== undefined && longitude !== undefined) {
              const res = await fetchWeatherAtCoordinates(latitude, longitude);
              if (!res.ok) return { content: res.error, isError: true };
              return { content: JSON.stringify({ detectedFrom: "coordinates", ...res }, null, 2) };
            }
            if (city) location = city;
          }
        }

        if (useHere && !location) {
          return {
            content:
              "Precise location unknown (browser GPS not granted). Ask the user which city, or ask them to Allow Location in the browser — do not guess a metro from IP.",
            isError: true,
          };
        }

        const res = await fetchWeather(location);
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify(res, null, 2) };
      }
      case "fetch_url": {
        const url = typeof input.url === "string" ? input.url : "";
        const res = await fetchWebPage(url);
        if (!res.ok) return { content: res.error, isError: true };
        return {
          content: JSON.stringify(
            { title: res.title, url: res.url, provider: res.provider, content: res.content },
            null,
            2,
          ),
        };
      }
      case "web_search": {
        const query = typeof input.query === "string" ? input.query : "";
        const max =
          typeof input.max_results === "number" ? Math.min(10, Math.max(1, input.max_results)) : 6;
        const res = await searchWeb(query, max);
        if (!res.ok) {
          return {
            content: `${res.error}\n\nDo NOT tell the user that "search systems are down" unless this error clearly indicates a network/provider outage. Retry once with a shorter, more specific query (name + company/role/location), or ask the user for clarifying context.`,
            isError: true,
          };
        }
        if (!res.results.length) {
          return {
            content: JSON.stringify(
              {
                ok: true,
                query: res.query,
                provider: res.provider,
                results: [],
                note: "Search ran successfully but found no strong public web hits for this query. This is not an outage — the person/topic may not be widely indexed. Ask the user for more context (industry, location, company, LinkedIn/X handle) instead of saying search is down.",
              },
              null,
              2,
            ),
          };
        }
        return { content: JSON.stringify(res, null, 2) };
      }
      case "run_code": {
        const code = typeof input.code === "string" ? input.code : "";
        const language = typeof input.language === "string" ? input.language : "javascript";
        const res = await runSandboxedCode(code, language);
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify(res, null, 2) };
      }
      case "generate_artifact": {
        const res = generateArtifact({
          title: typeof input.title === "string" ? input.title : undefined,
          format: typeof input.format === "string" ? input.format : "markdown",
          content: typeof input.content === "string" ? input.content : "",
          filename: typeof input.filename === "string" ? input.filename : undefined,
        });
        if (!res.ok) return { content: res.error, isError: true };
        return {
          content: JSON.stringify(
            {
              ok: true,
              filename: res.filename,
              mimeType: res.mimeType,
              format: res.format,
              markdownDownload: res.markdownDownload,
              preview: res.content.slice(0, 4_000),
              instruction:
                "Include the markdownDownload link in your reply so the user can download the file.",
            },
            null,
            2,
          ),
        };
      }
      case "save_app": {
        if (!ctx.userId) {
          return {
            content: "User must be signed in to save apps to App Management.",
            isError: true,
          };
        }
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name) return { content: "name is required", isError: true };
        let files: Array<{ path: string; content: string }> = [];
        if (Array.isArray(input.files)) {
          files = input.files
            .filter(
              (f): f is { path: string; content: string } =>
                Boolean(f) &&
                typeof f === "object" &&
                typeof (f as { path?: unknown }).path === "string" &&
                typeof (f as { content?: unknown }).content === "string",
            )
            .map((f) => ({ path: f.path, content: f.content }));
        } else if (typeof input.files_json === "string") {
          try {
            const parsed = JSON.parse(input.files_json) as unknown;
            if (Array.isArray(parsed)) {
              files = parsed
                .filter(
                  (f): f is { path: string; content: string } =>
                    Boolean(f) &&
                    typeof f === "object" &&
                    typeof (f as { path?: unknown }).path === "string" &&
                    typeof (f as { content?: unknown }).content === "string",
                )
                .map((f) => ({ path: f.path, content: f.content }));
            }
          } catch {
            return { content: "files_json is not valid JSON", isError: true };
          }
        }
        if (files.length === 0) {
          return {
            content:
              "Provide files: [{path, content}, ...] or files_json. Include the Canvas project files.",
            isError: true,
          };
        }
        const app = await createManagedApp(ctx.userId, {
          name,
          description: typeof input.description === "string" ? input.description : undefined,
          files,
        });
        return {
          content: JSON.stringify(
            {
              ok: true,
              appId: app.id,
              slug: app.slug,
              status: app.status,
              fileCount: app.files.length,
              message:
                "App saved. Call publish_app with this appId to make it live at /a/<slug>, or the user can Publish from Settings → Apps.",
            },
            null,
            2,
          ),
        };
      }
      case "publish_app": {
        if (!ctx.userId) {
          return { content: "User must be signed in to publish apps.", isError: true };
        }
        const appId = typeof input.app_id === "string" ? input.app_id.trim() : "";
        if (!appId) return { content: "app_id is required", isError: true };
        try {
          const app = await publishManagedApp(ctx.userId, appId);
          return {
            content: JSON.stringify(
              {
                ok: true,
                appId: app.id,
                slug: app.slug,
                status: app.status,
                deployedUrl: app.deployedUrl,
                message: `Live at ${app.deployedUrl}. Include this URL in your reply.`,
              },
              null,
              2,
            ),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Publish failed",
            isError: true,
          };
        }
      }
      case "unpublish_app": {
        if (!ctx.userId) {
          return { content: "User must be signed in to unpublish apps.", isError: true };
        }
        const appId = typeof input.app_id === "string" ? input.app_id.trim() : "";
        if (!appId) return { content: "app_id is required", isError: true };
        try {
          const app = await unpublishManagedApp(ctx.userId, appId);
          return {
            content: JSON.stringify({
              ok: true,
              appId: app.id,
              slug: app.slug,
              status: app.status,
              message: "App unpublished; /a/<slug> is offline.",
            }),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Unpublish failed",
            isError: true,
          };
        }
      }
      case "create_task": {
        if (!ctx.userId) {
          return { content: "User must be signed in to create tasks.", isError: true };
        }
        const name = typeof input.name === "string" ? input.name : "";
        const prompt = typeof input.prompt === "string" ? input.prompt : "";
        const schedule = input.schedule;
        if (!isTaskSchedulePreset(schedule)) {
          return { content: "schedule must be hourly, daily, or weekly", isError: true };
        }
        try {
          const task = await createManagedTask(ctx.userId, {
            name,
            prompt,
            schedule,
            enabled: input.enabled !== false,
          });
          return {
            content: JSON.stringify({
              ok: true,
              task: taskSummary(task),
              message: `Task scheduled (${schedule}). Next run ${task.nextRunAt}. Manage in Settings → Tasks.`,
            }),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Create task failed",
            isError: true,
          };
        }
      }
      case "list_tasks": {
        if (!ctx.userId) {
          return { content: "User must be signed in to list tasks.", isError: true };
        }
        const tasks = await listManagedTasks(ctx.userId);
        return {
          content: JSON.stringify({ ok: true, tasks: tasks.map(taskSummary) }, null, 2),
        };
      }
      case "delete_task": {
        if (!ctx.userId) {
          return { content: "User must be signed in to delete tasks.", isError: true };
        }
        const taskId = typeof input.task_id === "string" ? input.task_id.trim() : "";
        if (!taskId) return { content: "task_id is required", isError: true };
        const ok = await deleteManagedTask(ctx.userId, taskId);
        if (!ok) return { content: "Task not found", isError: true };
        return { content: JSON.stringify({ ok: true, taskId }) };
      }
      case "create_agent": {
        if (!ctx.userId) {
          return { content: "User must be signed in to create agents.", isError: true };
        }
        const name = typeof input.name === "string" ? input.name : "";
        const effortRaw = typeof input.effort === "string" ? input.effort : "auto";
        const effort: AgentEffort =
          effortRaw === "low" || effortRaw === "high" || effortRaw === "auto" ? effortRaw : "auto";
        try {
          const agent = await createManagedAgent(ctx.userId, {
            name,
            description: typeof input.description === "string" ? input.description : "",
            behaviorInstructions:
              typeof input.behavior_instructions === "string" ? input.behavior_instructions : "",
            responseInstructions:
              typeof input.response_instructions === "string" ? input.response_instructions : "",
            deepResearch: Boolean(input.deep_research),
            effort,
          });
          const activate = input.activate !== false;
          if (activate) {
            await setActiveManagedAgent(ctx.userId, agent.id);
          }
          return {
            content: JSON.stringify({
              ok: true,
              agent: {
                id: agent.id,
                name: agent.name,
                description: agent.description,
                deepResearch: agent.deepResearch,
                effort: agent.effort,
              },
              active: activate,
              message: activate
                ? `Agent "${agent.name}" created and is now active in chat. Tell the user they can switch agents from the Agents menu.`
                : `Agent "${agent.name}" created. Use set_active_agent to talk to it.`,
            }),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Create agent failed",
            isError: true,
          };
        }
      }
      case "list_agents": {
        if (!ctx.userId) {
          return { content: "User must be signed in to list agents.", isError: true };
        }
        const store = await getAgentStore(ctx.userId);
        return {
          content: JSON.stringify(
            {
              ok: true,
              activeAgentId: store.activeAgentId,
              agents: store.agents.map((a) => ({
                id: a.id,
                name: a.name,
                description: a.description,
                deepResearch: a.deepResearch,
                effort: a.effort,
                enabled: a.enabled,
                active: a.id === store.activeAgentId,
              })),
            },
            null,
            2,
          ),
        };
      }
      case "set_active_agent": {
        if (!ctx.userId) {
          return { content: "User must be signed in to switch agents.", isError: true };
        }
        const raw = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
        const agentId = raw.length > 0 ? raw : null;
        try {
          const store = await setActiveManagedAgent(ctx.userId, agentId);
          const active = store.agents.find((a) => a.id === store.activeAgentId) ?? null;
          return {
            content: JSON.stringify({
              ok: true,
              activeAgentId: store.activeAgentId,
              agent: active
                ? { id: active.id, name: active.name, description: active.description }
                : null,
              message: active
                ? `Now talking as agent "${active.name}".`
                : "Cleared custom agent — using default FIGHURAI.",
            }),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Switch agent failed",
            isError: true,
          };
        }
      }
      case "update_agent": {
        if (!ctx.userId) {
          return { content: "User must be signed in to update agents.", isError: true };
        }
        const agentId = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
        if (!agentId) return { content: "agent_id is required", isError: true };
        const patch: Parameters<typeof updateManagedAgent>[2] = {};
        if (typeof input.name === "string") patch.name = input.name;
        if (typeof input.description === "string") patch.description = input.description;
        if (typeof input.behavior_instructions === "string") {
          patch.behaviorInstructions = input.behavior_instructions;
        }
        if (typeof input.response_instructions === "string") {
          patch.responseInstructions = input.response_instructions;
        }
        if (typeof input.deep_research === "boolean") patch.deepResearch = input.deep_research;
        if (input.effort === "auto" || input.effort === "low" || input.effort === "high") {
          patch.effort = input.effort;
        }
        if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
        try {
          const agent = await updateManagedAgent(ctx.userId, agentId, patch);
          if (!agent) return { content: "Agent not found", isError: true };
          return {
            content: JSON.stringify({
              ok: true,
              agent: {
                id: agent.id,
                name: agent.name,
                description: agent.description,
                deepResearch: agent.deepResearch,
                effort: agent.effort,
              },
            }),
          };
        } catch (e) {
          return {
            content: e instanceof Error ? e.message : "Update agent failed",
            isError: true,
          };
        }
      }
      case "delete_agent": {
        if (!ctx.userId) {
          return { content: "User must be signed in to delete agents.", isError: true };
        }
        const agentId = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
        if (!agentId) return { content: "agent_id is required", isError: true };
        const ok = await deleteManagedAgent(ctx.userId, agentId);
        if (!ok) return { content: "Agent not found", isError: true };
        return { content: JSON.stringify({ ok: true, agentId }) };
      }
      case "generate_image": {
        const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
        const sizeRaw = typeof input.size === "string" ? input.size.trim() : "";
        const size =
          sizeRaw === "1792x1024" || sizeRaw === "1024x1792" ? sizeRaw : "1024x1024";
        const res = await generateImage(prompt, { size, quality: "hd" });
        if (!res.ok) {
          return {
            content: `ERROR: ${res.error}. If cloning a website, use the source site's absolute image URLs instead of generate_image.`,
            isError: true,
          };
        }
        const md = imageResultToMarkdown(res, prompt.slice(0, 80) || "Generated image");
        return {
          content: JSON.stringify(
            {
              ok: true,
              provider: res.provider,
              revisedPrompt: res.revisedPrompt,
              markdown: md,
              instruction: "Include the markdown image in your reply so Canvas can preview it.",
            },
            null,
            2,
          ),
        };
      }
      case "list_gmail_recent": {
        const token = await getGoogleAccessToken(ctx.request);
        if (!token) return { content: "Gmail not connected.", isError: true };
        const res = await listGmailRecent(token, clampMax(input.max_results));
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify({ messages: res.messages }, null, 2) };
      }
      case "list_google_calendar_upcoming": {
        const token = await getGoogleAccessToken(ctx.request);
        if (!token) return { content: "Google Calendar not connected.", isError: true };
        const res = await listGoogleCalendarUpcoming(token, clampMax(input.max_results));
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify({ events: res.events }, null, 2) };
      }
      case "list_outlook_recent": {
        const token = await getMicrosoftAccessToken(ctx.request);
        if (!token) return { content: "Outlook not connected.", isError: true };
        const res = await listOutlookRecent(token, clampMax(input.max_results));
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify({ messages: res.messages }, null, 2) };
      }
      case "list_microsoft_calendar_upcoming": {
        const token = await getMicrosoftAccessToken(ctx.request);
        if (!token) return { content: "Microsoft 365 calendar not connected.", isError: true };
        const res = await listMicrosoftCalendarUpcoming(token, clampMax(input.max_results));
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify({ events: res.events }, null, 2) };
      }
      case "list_device_files": {
        const manifest = ctx.deviceManifest;
        if (!manifest?.entries.length) {
          return { content: "No device folder indexed.", isError: true };
        }
        const q = typeof input.query === "string" ? input.query.toLowerCase().trim() : "";
        const max = clampMax(input.max_results, 30);
        let entries = manifest.entries;
        if (q) {
          entries = entries.filter(
            (e) => e.path.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
          );
        }
        const slice = entries.slice(0, max).map((e) => ({
          path: e.path,
          name: e.name,
          kind: e.kind,
          size: e.size,
          mimeType: e.mimeType,
          hasContent: Boolean(e.content),
        }));
        return {
          content: JSON.stringify(
            {
              summary: manifestSummary(manifest),
              entries: slice,
              coworkOrganizeHint:
                "Next: call propose_device_file_ops with your move/rename/mkdir plan (paths relative to root). The app shows an Apply button—never tell the user to use Terminal or that this tool is missing.",
            },
            null,
            2,
          ),
        };
      }
      case "read_device_file": {
        const manifest = ctx.deviceManifest;
        const path = typeof input.path === "string" ? input.path : "";
        if (!manifest || !path) {
          return { content: "path required", isError: true };
        }
        const entry = manifest.entries.find((e) => e.path === path && e.kind === "file");
        if (!entry) return { content: `File not found in manifest: ${path}`, isError: true };
        if (!entry.content) {
          return {
            content: `File "${path}" is indexed but has no text preview (binary or too large).`,
            isError: true,
          };
        }
        return {
          content: JSON.stringify(
            { path: entry.path, name: entry.name, mimeType: entry.mimeType, content: entry.content },
            null,
            2,
          ),
        };
      }
      case "propose_device_file_ops": {
        if (!ctx.deviceManifest?.entries.length) {
          return { content: "No device folder connected.", isError: true };
        }
        const payload = deviceOpsFromToolInput(input);
        if (!payload) {
          return {
            content: JSON.stringify({
              ok: false,
              retry: true,
              hint: 'Use ops: [{"op":"move","from":"path/in/root","to":"folder/file"}, {"op":"mkdir","path":"folder"}] with paths from list_device_files. Or ops_json as a JSON string. Do NOT use Terminal.',
              example: {
                summary: "Sort creative files",
                ops: [{ op: "move", from: "draft.png", to: "images/draft.png" }],
              },
            }),
            isError: true,
          };
        }
        return {
          content: JSON.stringify(
            {
              ok: true,
              message:
                "Plan submitted. Tell the user a popup with an **Apply** button will appear—do NOT say Apply is missing or suggest Terminal.",
              opCount: payload.ops.length,
            },
            null,
            2,
          ),
          deviceOps: payload,
        };
      }
      default: {
        const binding = ctx.mcpBindings?.[name];
        if (binding) {
          return executeMcpAgentTool(ctx.mcpConfig ?? emptyMcpConfig(), binding, input);
        }
        return { content: `Unknown tool: ${name}`, isError: true };
      }
    }
  } catch (e) {
    return {
      content: e instanceof Error ? e.message : "Tool execution failed",
      isError: true,
    };
  }
}
