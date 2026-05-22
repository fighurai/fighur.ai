/** True when user profiles cannot persist on disk (Vercel serverless without SMILE_USER_DATA_DIR). */
export function usesEphemeralUserStorage(): boolean {
  return Boolean(process.env.VERCEL) && !process.env.SMILE_USER_DATA_DIR?.trim();
}
