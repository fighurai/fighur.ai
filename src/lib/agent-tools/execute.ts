import {
  listGmailRecent,
  listGoogleCalendarUpcoming,
} from "@/lib/integrations/google-api";
import {
  listMicrosoftCalendarUpcoming,
  listOutlookRecent,
} from "@/lib/integrations/microsoft-api";
import { fetchWebPage } from "@/lib/integrations/fetch-url";
import { fetchWeather, fetchWeatherAtCoordinates } from "@/lib/integrations/weather-api";
import { searchWeb } from "@/lib/integrations/web-search-api";
import { formatUserLocationLabel } from "@/lib/client-location";
import type { AgentToolContext, AgentToolResult } from "@/lib/agent-tools/types";
import { deviceOpsFromToolInput } from "@/lib/device-ops-parse";
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
      case "get_weather": {
        let location = typeof input.location === "string" ? input.location.trim() : "";
        const useHere = !location || /^(here|my\s*(city|location|area)|local|current\s*location)$/i.test(location);

        if (useHere && ctx.userLocation) {
          const { latitude, longitude, city } = ctx.userLocation;
          if (latitude !== undefined && longitude !== undefined) {
            const res = await fetchWeatherAtCoordinates(latitude, longitude);
            if (!res.ok) return { content: res.error, isError: true };
            return { content: JSON.stringify({ detectedFrom: "coordinates", ...res }, null, 2) };
          }
          if (city) location = city;
        }

        if (useHere && !location) {
          const label = ctx.userLocation ? formatUserLocationLabel(ctx.userLocation) : null;
          return {
            content: label
              ? `Could not resolve weather for detected area (${label}). Ask the user for their city or enable location in the browser.`
              : "User location unknown. Ask which city or enable location permission in the browser.",
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
        if (!res.ok) return { content: res.error, isError: true };
        return { content: JSON.stringify(res, null, 2) };
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
