/** Gmail + Calendar read helpers (readonly scopes from connect flow). */

export type MailSummary = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export type CalendarEventSummary = {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
};

export async function listGmailRecent(
  accessToken: string,
  maxResults = 8,
): Promise<{ ok: true; messages: MailSummary[] } | { ok: false; error: string }> {
  try {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(maxResults));
    listUrl.searchParams.set("q", "in:inbox newer_than:14d");

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      return { ok: false, error: `Gmail list ${listRes.status}` };
    }

    const listJson = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = listJson.messages?.slice(0, maxResults) ?? [];
    const messages: MailSummary[] = [];

    for (const { id } of ids) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as {
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = msg.payload?.headers ?? [];
      const get = (n: string) => headers.find((h) => h.name === n)?.value ?? "";
      messages.push({
        id,
        subject: get("Subject") || "(no subject)",
        from: get("From") || "",
        date: get("Date") || "",
        snippet: msg.snippet ?? "",
      });
    }

    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gmail failed" };
  }
}

export async function listGoogleCalendarUpcoming(
  accessToken: string,
  maxResults = 8,
): Promise<{ ok: true; events: CalendarEventSummary[] } | { ok: false; error: string }> {
  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", new Date().toISOString());

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, error: `Calendar ${res.status}` };

    const json = (await res.json()) as {
      items?: {
        id?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        location?: string;
      }[];
    };

    const events: CalendarEventSummary[] = (json.items ?? []).map((ev) => ({
      id: ev.id ?? "",
      title: ev.summary ?? "(no title)",
      start: ev.start?.dateTime ?? ev.start?.date ?? "",
      end: ev.end?.dateTime ?? ev.end?.date,
      location: ev.location,
    }));

    return { ok: true, events };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calendar failed" };
  }
}
