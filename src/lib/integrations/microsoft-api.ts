/** Microsoft Graph mail + calendar read helpers. */

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

export async function listOutlookRecent(
  accessToken: string,
  maxResults = 8,
): Promise<{ ok: true; messages: MailSummary[] } | { ok: false; error: string }> {
  try {
    const url = `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, error: `Outlook ${res.status}` };

    const json = (await res.json()) as {
      value?: {
        id?: string;
        subject?: string;
        from?: { emailAddress?: { address?: string; name?: string } };
        receivedDateTime?: string;
        bodyPreview?: string;
      }[];
    };

    const messages: MailSummary[] = (json.value ?? []).map((m) => ({
      id: m.id ?? "",
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.name
        ? `${m.from.emailAddress.name} <${m.from.emailAddress.address ?? ""}>`
        : m.from?.emailAddress?.address ?? "",
      date: m.receivedDateTime ?? "",
      snippet: m.bodyPreview ?? "",
    }));

    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Outlook failed" };
  }
}

export async function listMicrosoftCalendarUpcoming(
  accessToken: string,
  maxResults = 8,
): Promise<{ ok: true; events: CalendarEventSummary[] } | { ok: false; error: string }> {
  try {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=${maxResults}&$orderby=start/dateTime&$select=id,subject,start,end,location`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, error: `Calendar ${res.status}` };

    const json = (await res.json()) as {
      value?: {
        id?: string;
        subject?: string;
        start?: { dateTime?: string };
        end?: { dateTime?: string };
        location?: { displayName?: string };
      }[];
    };

    const events: CalendarEventSummary[] = (json.value ?? []).map((ev) => ({
      id: ev.id ?? "",
      title: ev.subject ?? "(no title)",
      start: ev.start?.dateTime ?? "",
      end: ev.end?.dateTime,
      location: ev.location?.displayName,
    }));

    return { ok: true, events };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Calendar failed" };
  }
}
