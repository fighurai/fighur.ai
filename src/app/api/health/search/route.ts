import { NextResponse } from "next/server";

import { isWebSearchConfigured, probeWebSearchProviders, searchWeb } from "@/lib/integrations/web-search-api";

export const dynamic = "force-dynamic";

/** Ops probe: which web search backends respond from this host. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "Apple Inc").slice(0, 120);
  const [probes, sample] = await Promise.all([
    probeWebSearchProviders(),
    searchWeb(q, 4),
  ]);

  return NextResponse.json({
    ok: true,
    paidKeysConfigured: isWebSearchConfigured(),
    probes,
    sample: sample.ok
      ? {
          ok: true,
          query: sample.query,
          provider: sample.provider,
          resultCount: sample.results.length,
          titles: sample.results.map((r) => r.title),
        }
      : { ok: false, error: sample.error },
  });
}
