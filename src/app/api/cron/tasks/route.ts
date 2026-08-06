import { NextResponse } from "next/server";

import { runDueTasks } from "@/lib/tasks/run";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in local/dev without secret so `curl` works; require in production.
    if (process.env.VERCEL_ENV === "production") return false;
    return true;
  }
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(10, Math.max(1, Number(limitRaw) || 5));

  const outcomes = await runDueTasks(limit);
  return NextResponse.json({
    ok: true,
    ran: outcomes.length,
    outcomes: outcomes.map((o) => ({
      userId: o.userId,
      taskId: o.taskId,
      status: o.status,
      detail: o.detail.slice(0, 160),
    })),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
