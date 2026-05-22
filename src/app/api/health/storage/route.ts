import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import { usesBlobUserStorage } from "@/lib/user-file-storage";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  return NextResponse.json({
    durableStorage: usesBlobUserStorage(),
    ephemeralOnly: usesEphemeralUserStorage(),
    signedIn: Boolean(session),
    userId: session?.userId ?? null,
  });
}
