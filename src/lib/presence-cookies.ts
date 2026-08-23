export const COOKIE_ANON = "smile_anon";
export const COOKIE_SESSION = "smile_session";
/** Set in Edge middleware on the first tap, before JS loads. */
export const COOKIE_TOUCH = "smile_touch";

const GUEST_ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

export function isGuestId(id: string): boolean {
  return GUEST_ID_RE.test(id);
}
