import {
  listGmailRecent,
  listGoogleCalendarUpcoming,
} from "@/lib/integrations/google-api";
import {
  listMicrosoftCalendarUpcoming,
  listOutlookRecent,
} from "@/lib/integrations/microsoft-api";
import type { AgentToolContext, AgentToolResult } from "@/lib/agent-tools/types";
import { manifestSummary } from "@/lib/device-manifest";
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
            { summary: manifestSummary(manifest), entries: slice },
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
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (e) {
    return {
      content: e instanceof Error ? e.message : "Tool execution failed",
      isError: true,
    };
  }
}
