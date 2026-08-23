const BUILTIN_ADMIN_EMAILS = ["hello@fighurai.com"] as const;

/** Emails that may see People / presence data. Nobody else. */
export function platformAdminEmails(): string[] {
  const extra =
    process.env.SMILE_ADMIN_EMAILS?.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")) ?? [];
  return [...new Set<string>([...BUILTIN_ADMIN_EMAILS, ...extra])];
}

export function isPlatformAdminEmail(emailRaw: string | undefined | null): boolean {
  const email = emailRaw?.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  return platformAdminEmails().includes(email);
}
