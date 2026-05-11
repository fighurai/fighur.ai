/** Acuity Scheduling — pick a time that works for you (override in deploy with NEXT_PUBLIC_BOOKING_URL). */
export const BOOKING_URL =
  process.env.NEXT_PUBLIC_BOOKING_URL?.trim() ||
  "https://app.acuityscheduling.com/schedule/fda4c0e1/appointment/86702710/calendar/13223132";

/**
 * FighurFinance target. Defaults to this app’s `/fighurfinance` preview so the link always works.
 * Set NEXT_PUBLIC_FIGHUR_FINANCE_URL to an absolute URL (e.g. http://localhost:5173) to open a separate dev server instead.
 */
export const FIGHUR_FINANCE_URL =
  process.env.NEXT_PUBLIC_FIGHUR_FINANCE_URL?.trim() || "/fighurfinance";

/** Short label for the Ask composer menu line */
export function fighurFinanceLinkLabel(url: string): string {
  if (url.startsWith("http")) {
    return url.replace(/^https?:\/\//, "");
  }
  return "Built-in preview";
}
