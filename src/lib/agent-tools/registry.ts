import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent-tools/types";
import { isImageGenerationAvailable } from "@/lib/integrations/image-generation-api";
import { loadMcpAgentTools } from "@/lib/mcp/tools";
import { emptyMcpConfig } from "@/lib/mcp/types";
import { getGoogleAccessToken, getMicrosoftAccessToken } from "@/lib/oauth-token";

export async function availableAgentTools(
  ctx: AgentToolContext,
): Promise<AgentToolDefinition[]> {
  const tools: AgentToolDefinition[] = [];
  const { flags } = ctx;

  tools.push({
    name: "get_weather",
    description:
      'Current weather and 5-day forecast. For "weather here" or "my weather" leave location empty to use the user\'s detected city. Never guess weather.',
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            'City name, or omit / use "here" for the user\'s detected location',
        },
      },
    },
  });

  tools.push({
    name: "web_search",
    description:
      "Search the live public internet. REQUIRED for current events, news, prices, sports, recent facts, and any question that needs up-to-date information. Do not say you lack internet access—call this tool.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "number", description: "Max results (1–10, default 6)" },
      },
      required: ["query"],
    },
  });

  tools.push({
    name: "fetch_url",
    description:
      "Read a public web page from a URL. REQUIRED when the user posts a link or when web_search returns a source you need to read in full. Never say you cannot open websites.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full http(s) URL to read" },
      },
      required: ["url"],
    },
  });

  tools.push({
    name: "run_code",
    description:
      "Execute JavaScript in a sandboxed VM for calculations, data transforms, and small algorithms. Use for math, parsing JSON/CSV snippets, and verifying logic. No network, no filesystem, no require/process.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript source to run" },
        language: {
          type: "string",
          description: "javascript (default). Only JS is supported on this host.",
        },
      },
      required: ["code"],
    },
  });

  tools.push({
    name: "generate_artifact",
    description:
      "Create a downloadable file for CSV, JSON, HTML exports, or when the user explicitly asks to download a file. Do NOT use this for writing deliverables (scripts, reels, reports, memos, research, captions)—those go in a ```markdown filename.md fence so Workspace Document opens. For markdown writing, skip this tool and fence the full text in your reply.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title used for filename" },
        format: {
          type: "string",
          description: "markdown | csv | json | html | txt",
        },
        content: { type: "string", description: "Full file contents" },
        filename: { type: "string", description: "Optional filename override" },
      },
      required: ["format", "content"],
    },
  });

  tools.push({
    name: "save_app",
    description:
      "Save a multi-file app into the user's App Management registry. Use after building a site/app in Canvas. Provide files as path+content. Returns app id and slug. Follow with publish_app to make it live at /a/<slug>.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "App name" },
        description: { type: "string", description: "Short description" },
        files: {
          type: "array",
          description:
            'Array of {"path":"index.html","content":"..."}. Max 40 files. Include index.html.',
        },
        files_json: {
          type: "string",
          description: "Alternative: JSON string of the files array",
        },
      },
      required: ["name"],
    },
  });

  tools.push({
    name: "publish_app",
    description:
      "Publish a saved App Management app to a public URL (/a/<slug>). Requires index.html (or another .html entry). User must be signed in.",
    input_schema: {
      type: "object",
      properties: {
        app_id: { type: "string", description: "App id from save_app" },
      },
      required: ["app_id"],
    },
  });

  tools.push({
    name: "unpublish_app",
    description: "Take a published app offline (removes /a/<slug>).",
    input_schema: {
      type: "object",
      properties: {
        app_id: { type: "string", description: "App id" },
      },
      required: ["app_id"],
    },
  });

  tools.push({
    name: "create_task",
    description:
      "Create a scheduled FIGHURAI task (hourly/daily/weekly). Runs the prompt on cron; store last result in Settings → Tasks. User must be signed in.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task name" },
        prompt: { type: "string", description: "Prompt to run on schedule" },
        schedule: {
          type: "string",
          description: "hourly | daily | weekly",
        },
        enabled: { type: "boolean", description: "Default true" },
      },
      required: ["name", "prompt", "schedule"],
    },
  });

  tools.push({
    name: "list_tasks",
    description: "List the signed-in user's scheduled tasks (name, schedule, last result).",
    input_schema: {
      type: "object",
      properties: {},
    },
  });

  tools.push({
    name: "delete_task",
    description: "Delete a scheduled task by id.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task id from list_tasks / create_task" },
      },
      required: ["task_id"],
    },
  });

  tools.push({
    name: "create_agent",
    description:
      "Create a custom FIGHURAI agent the user can talk to. Sets behavior + response instructions, optional deep research and effort. After creating, the agent becomes active for chat unless set_active_agent is used later. User must be signed in.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short agent name" },
        description: { type: "string", description: "Role / mission summary" },
        behavior_instructions: {
          type: "string",
          description: "How the agent approaches problems and which methods to use",
        },
        response_instructions: {
          type: "string",
          description: "Tone, persona, length, and structure of replies",
        },
        deep_research: {
          type: "boolean",
          description: "Prefer multi-source live web research with citations",
        },
        effort: {
          type: "string",
          description: "auto | low | high",
        },
        activate: {
          type: "boolean",
          description: "Make this agent active in chat (default true)",
        },
      },
      required: ["name"],
    },
  });

  tools.push({
    name: "list_agents",
    description: "List the signed-in user's custom agents and which one is active in chat.",
    input_schema: {
      type: "object",
      properties: {},
    },
  });

  tools.push({
    name: "set_active_agent",
    description:
      "Switch which custom agent is active for subsequent chat turns. Pass agent_id from list_agents/create_agent, or null/empty for default FIGHURAI.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent id, or empty string to clear (default assistant)",
        },
      },
    },
  });

  tools.push({
    name: "update_agent",
    description: "Update an existing custom agent's name, instructions, deep research, or effort.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent id" },
        name: { type: "string" },
        description: { type: "string" },
        behavior_instructions: { type: "string" },
        response_instructions: { type: "string" },
        deep_research: { type: "boolean" },
        effort: { type: "string", description: "auto | low | high" },
        enabled: { type: "boolean" },
      },
      required: ["agent_id"],
    },
  });

  tools.push({
    name: "delete_agent",
    description: "Delete a custom agent by id.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent id" },
      },
      required: ["agent_id"],
    },
  });

  if (isImageGenerationAvailable()) {
    tools.push({
      name: "generate_image",
      description:
        "Generate a photo-realistic or artistic raster image from a text prompt (DALL·E 3). REQUIRED for photorealistic photos, product shots, portraits, and complex illustrations—do not invent base64. After the tool returns, include the markdown image in your reply.",
      input_schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed image description" },
          size: {
            type: "string",
            description: "1024x1024 (default), 1792x1024 landscape, or 1024x1792 portrait",
          },
        },
        required: ["prompt"],
      },
    });
  }

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

  const mcpConfig = ctx.mcpConfig ?? emptyMcpConfig();
  if (Object.keys(mcpConfig.mcpServers).length > 0) {
    const mcp = await loadMcpAgentTools(mcpConfig);
    if (ctx.mcpBindings) {
      Object.assign(ctx.mcpBindings, mcp.bindings);
    } else {
      ctx.mcpBindings = mcp.bindings;
    }
    tools.push(...mcp.tools);
  }

  return tools;
}

export async function hasAnyAgentTools(ctx: AgentToolContext): Promise<boolean> {
  const tools = await availableAgentTools(ctx);
  return tools.length > 0;
}
