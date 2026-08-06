import { NextResponse } from "next/server";

const MAX_BYTES = 4_500_000;
const ALLOWED = /^(image\/(png|jpeg|jpg|webp|gif|svg\+xml|avif)|video\/(mp4|webm)|font\/|application\/font)/i;

function isSafeTarget(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname === "localhost" || u.hostname.endsWith(".local")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Proxy remote images/fonts so Canvas srcDoc previews can load hotlink-sensitive assets. */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const target = isSafeTarget(url);
  if (!target) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(target.href, {
      headers: {
        "User-Agent": "FIGHURAI/1.0 (asset proxy; +https://fighur.ai)",
        Accept: "image/*,video/*,*/*;q=0.8",
        Referer: target.origin + "/",
      },
      cache: "force-cache",
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }
    const type = res.headers.get("content-type") || "application/octet-stream";
    if (!ALLOWED.test(type) && !/\.(png|jpe?g|webp|gif|svg|avif|mp4|woff2?)(\?|$)/i.test(target.pathname)) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Asset too large" }, { status: 413 });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Proxy failed" },
      { status: 502 },
    );
  }
}
