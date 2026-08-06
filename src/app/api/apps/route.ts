import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import {
  archiveManagedApp,
  createManagedApp,
  getManagedApp,
  listManagedApps,
  updateManagedApp,
} from "@/lib/apps/store";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const app = await getManagedApp(session.userId, id);
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ app });
  }

  const apps = await listManagedApps(session.userId);
  return NextResponse.json({
    apps: apps.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      slug: a.slug,
      fileCount: a.files.length,
      deployedUrl: a.deployedUrl,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    action?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    files?: unknown;
    status?: unknown;
  };

  const action = typeof b.action === "string" ? b.action : "create";

  if (action === "create") {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const files = Array.isArray(b.files)
      ? b.files.filter(
          (f): f is { path: string; content: string } =>
            Boolean(f) &&
            typeof f === "object" &&
            typeof (f as { path?: unknown }).path === "string" &&
            typeof (f as { content?: unknown }).content === "string",
        )
      : [];
    if (files.length === 0) {
      return NextResponse.json({ error: "files[] required" }, { status: 400 });
    }
    const app = await createManagedApp(session.userId, {
      name,
      description: typeof b.description === "string" ? b.description : undefined,
      files,
    });
    return NextResponse.json({ ok: true, app });
  }

  if (action === "update") {
    const id = typeof b.id === "string" ? b.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch: Parameters<typeof updateManagedApp>[2] = {};
    if (typeof b.name === "string") patch.name = b.name;
    if (typeof b.description === "string") patch.description = b.description;
    if (
      b.status === "draft" ||
      b.status === "ready" ||
      b.status === "deployed" ||
      b.status === "archived"
    ) {
      patch.status = b.status;
    }
    if (Array.isArray(b.files)) {
      patch.files = b.files.filter(
        (f): f is { path: string; content: string } =>
          Boolean(f) &&
          typeof f === "object" &&
          typeof (f as { path?: unknown }).path === "string" &&
          typeof (f as { content?: unknown }).content === "string",
      );
    }
    const app = await updateManagedApp(session.userId, id, patch);
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, app });
  }

  if (action === "archive") {
    const id = typeof b.id === "string" ? b.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await archiveManagedApp(session.userId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be create|update|archive" }, { status: 400 });
}
