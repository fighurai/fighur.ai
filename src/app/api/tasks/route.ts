import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";
import { isTaskSchedulePreset, scheduleLabel } from "@/lib/tasks/schedule";
import { taskDetail, taskSummary, runScheduledTask } from "@/lib/tasks/run";
import {
  createManagedTask,
  deleteManagedTask,
  getManagedTask,
  listManagedTasks,
  updateManagedTask,
} from "@/lib/tasks/store";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const task = await getManagedTask(session.userId, id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      task: taskDetail(task),
      ephemeralStorage: usesEphemeralUserStorage(),
    });
  }

  const tasks = await listManagedTasks(session.userId);
  return NextResponse.json({
    tasks: tasks.map(taskDetail),
    schedules: ["hourly", "daily", "weekly"].map((s) => ({
      id: s,
      label: scheduleLabel(s as "hourly" | "daily" | "weekly"),
    })),
    ephemeralStorage: usesEphemeralUserStorage(),
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
    prompt?: unknown;
    schedule?: unknown;
    enabled?: unknown;
  };

  const action = typeof b.action === "string" ? b.action : "create";

  try {
    if (action === "create") {
      const name = typeof b.name === "string" ? b.name : "";
      const prompt = typeof b.prompt === "string" ? b.prompt : "";
      if (!isTaskSchedulePreset(b.schedule)) {
        return NextResponse.json(
          { error: "schedule must be hourly|daily|weekly" },
          { status: 400 },
        );
      }
      const task = await createManagedTask(session.userId, {
        name,
        prompt,
        schedule: b.schedule,
        enabled: b.enabled !== false,
      });
      return NextResponse.json({ ok: true, task: taskDetail(task) });
    }

    if (action === "update") {
      const id = typeof b.id === "string" ? b.id : "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Parameters<typeof updateManagedTask>[2] = {};
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.prompt === "string") patch.prompt = b.prompt;
      if (isTaskSchedulePreset(b.schedule)) patch.schedule = b.schedule;
      if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
      const task = await updateManagedTask(session.userId, id, patch);
      if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, task: taskDetail(task) });
    }

    if (action === "delete") {
      const id = typeof b.id === "string" ? b.id : "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ok = await deleteManagedTask(session.userId, id);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (action === "run") {
      const id = typeof b.id === "string" ? b.id : "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const outcome = await runScheduledTask(session.userId, id);
      const task = await getManagedTask(session.userId, id);
      return NextResponse.json({
        ok: outcome.status === "ok",
        outcome,
        task: task ? taskDetail(task) : null,
      });
    }

    return NextResponse.json(
      { error: "action must be create|update|delete|run" },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Task operation failed" },
      { status: 400 },
    );
  }
}
