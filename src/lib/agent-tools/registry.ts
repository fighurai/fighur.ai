import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent-tools/types";
import { getGoogleAccessToken, getMicrosoftAccessToken } from "@/lib/oauth-token";

export async function availableAgentTools(
  ctx: AgentToolContext,
): Promise<AgentToolDefinition[]> {
  const tools: AgentToolDefinition[] = [];
  const { flags } = ctx;

  const cowork = flags.workMode === "cowork" || flags.coworkDevice === true;
  const googleToken =
    flags.gmail || flags.googleCalendar || cowork
      ? await getGoogleAccessToken(ctx.request)
      : null;
  const msToken =
    flags.outlook || flags.microsoft365 || cowork
      ? await getMicrosoftAccessToken(ctx.request)
      : null;

  if (googleToken && (flags.gmail || cowork)) {
    tools.push({
      name: "list_gmail_recent",
      description:
        "List recent Gmail inbox messages (subject, from, date, snippet). Read-only; last ~14 days.",
      input_schema: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max messages (1–15, default 8)" },
        },
      },
    });
  }

  if (googleToken && (flags.googleCalendar || cowork)) {
    tools.push({
      name: "list_google_calendar_upcoming",
      description: "List upcoming events on the user's primary Google Calendar.",
      input_schema: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max events (1–15, default 8)" },
        },
      },
    });
  }

  if (msToken && (flags.outlook || cowork)) {
    tools.push({
      name: "list_outlook_recent",
      description: "List recent Outlook / Microsoft 365 mail (subject, from, date, preview).",
      input_schema: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max messages (1–15, default 8)" },
        },
      },
    });
  }

  if (msToken && (flags.microsoft365 || cowork)) {
    tools.push({
      name: "list_microsoft_calendar_upcoming",
      description: "List upcoming events from the user's Microsoft 365 calendar.",
      input_schema: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max events (1–15, default 8)" },
        },
      },
    });
  }

  if (ctx.deviceManifest && ctx.deviceManifest.entries.length > 0) {
    tools.push({
      name: "propose_device_file_ops",
      description:
        "Organize/move/rename/mkdir files in the user's connected device folder. REQUIRED for any file organization request. The FIGHURAI app shows an Apply button—never use Terminal or claim this tool is missing.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short description of the plan" },
          ops: {
            type: "array",
            description:
              'Moves/renames/mkdirs. Each item: {"op":"move","from":"rel/path","to":"folder/file"} or mkdir/rename. Max 40.',
          },
          ops_json: {
            type: "string",
            description:
              'Alternative: JSON string of ops array, e.g. [{"op":"move","from":"a.png","to":"images/a.png"}]',
          },
        },
      },
    });
    tools.push({
      name: "list_device_files",
      description:
        "Search the user's connected device folder manifest by path substring or file name. For move/sort/organize requests in CoWork mode, follow with propose_device_file_ops (not Terminal).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring to match in paths (optional)" },
          max_results: { type: "number", description: "Max entries (default 30)" },
        },
      },
    });
    tools.push({
      name: "read_device_file",
      description:
        "Read text content of a file from the device manifest by exact path. Only works for indexed text files.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Exact path from list_device_files" },
        },
        required: ["path"],
      },
    });
  }

  return tools;
}

export async function hasAnyAgentTools(ctx: AgentToolContext): Promise<boolean> {
  const tools = await availableAgentTools(ctx);
  return tools.length > 0;
}
