import { NextResponse } from "next/server";

import { readHostedAppIndex } from "@/lib/apps/hosted-index";
import {
  hostedAppSecurityHeaders,
  lookupAppFile,
  mimeForAppPath,
} from "@/lib/apps/serve";
import { getManagedApp } from "@/lib/apps/store";

type RouteParams = { params: Promise<{ slug: string; path?: string[] }> };

export async function GET(_request: Request, context: RouteParams) {
  const { slug, path: pathParts = [] } = await context.params;
  const index = await readHostedAppIndex(slug);
  if (!index) {
    return new NextResponse("App not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const app = await getManagedApp(index.userId, index.appId);
  if (!app || app.status !== "deployed" || app.slug !== slug) {
    return new NextResponse("App not published", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const file = lookupAppFile(app, pathParts);
  if (!file) {
    return new NextResponse("File not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const contentType = mimeForAppPath(file.path);
  return new NextResponse(file.content, {
    status: 200,
    headers: hostedAppSecurityHeaders(contentType),
  });
}
