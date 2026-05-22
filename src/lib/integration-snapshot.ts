import {
  listGmailRecent,
  listGoogleCalendarUpcoming,
} from "@/lib/integrations/google-api";
import {
  listMicrosoftCalendarUpcoming,
  listOutlookRecent,
} from "@/lib/integrations/microsoft-api";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import { getGoogleAccessToken, getMicrosoftAccessToken } from "@/lib/oauth-token";

/** Prefetch live data for non-tool models (OpenAI/Groq) in CoWork mode. */
export async function buildIntegrationSnapshot(
  request: Request,
  flags: Partial<ChatIntegrationFlags> | null | undefined,
): Promise<string> {
  if (!flags) return "";
  const mode = flags.workMode ?? (flags.coworkDevice ? "cowork" : "chat");
  if (mode !== "cowork") return "";

  const blocks: string[] = [];

  if (flags.gmail) {
    const token = await getGoogleAccessToken(request);
    if (token) {
      const res = await listGmailRecent(token, 5);
      if (res.ok) {
        blocks.push(`### Gmail (live)\n${JSON.stringify(res.messages, null, 2)}`);
      }
    }
  }

  if (flags.googleCalendar) {
    const token = await getGoogleAccessToken(request);
    if (token) {
      const res = await listGoogleCalendarUpcoming(token, 5);
      if (res.ok) {
        blocks.push(`### Google Calendar (live)\n${JSON.stringify(res.events, null, 2)}`);
      }
    }
  }

  if (flags.outlook) {
    const token = await getMicrosoftAccessToken(request);
    if (token) {
      const res = await listOutlookRecent(token, 5);
      if (res.ok) {
        blocks.push(`### Outlook (live)\n${JSON.stringify(res.messages, null, 2)}`);
      }
    }
  }

  if (flags.microsoft365) {
    const token = await getMicrosoftAccessToken(request);
    if (token) {
      const res = await listMicrosoftCalendarUpcoming(token, 5);
      if (res.ok) {
        blocks.push(`### Microsoft Calendar (live)\n${JSON.stringify(res.events, null, 2)}`);
      }
    }
  }

  if (blocks.length === 0) return "";
  return `\n\n## Live integration snapshot (read-only)\n${blocks.join("\n\n")}`;
}
