/** Short device / browser label for the admin People view. */
export function summarizeUserAgent(ua: string): string {
  const raw = ua.trim();
  if (!raw || raw === "unknown") return "Unknown device";

  const ios = /iPhone|iPad|iPod/i.test(raw);
  const android = /Android/i.test(raw);
  const mac = /Macintosh/i.test(raw);
  const windows = /Windows/i.test(raw);
  const linux = /Linux/i.test(raw) && !android;

  let browser = "Browser";
  if (/Edg\//.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//.test(raw) && !/Edg\//.test(raw)) browser = "Chrome";
  else if (/Firefox\//.test(raw)) browser = "Firefox";
  else if (/Safari\//.test(raw) && !/Chrome\//.test(raw)) browser = "Safari";
  else if (/Fighur|Capacitor/i.test(raw)) browser = "FIGHURAI app";

  let os = "unknown OS";
  if (ios) os = "iOS";
  else if (android) os = "Android";
  else if (mac) os = "macOS";
  else if (windows) os = "Windows";
  else if (linux) os = "Linux";

  return `${browser} · ${os}`;
}
