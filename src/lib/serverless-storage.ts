import { usesBlobUserStorage } from "@/lib/user-file-storage";

/** True when user data may not survive deploys (Vercel /tmp only). */
export function usesEphemeralUserStorage(): boolean {
  return (
    Boolean(process.env.VERCEL) &&
    !process.env.SMILE_USER_DATA_DIR?.trim() &&
    !usesBlobUserStorage()
  );
}
