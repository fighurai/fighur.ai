import { NextResponse } from "next/server";

import { readVerifiedSession } from "@/lib/session-cookie";
import { parseSkillMarkdown, serializeSkillMarkdown } from "@/lib/skills/parse";
import { listSkillIndex, resolveUserSkills } from "@/lib/skills/registry";
import { readUserSkillPrefs, writeUserSkillPrefs } from "@/lib/skills/store";

export async function GET(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    const index = await listSkillIndex(null);
    return NextResponse.json({ skills: index, signedIn: false });
  }
  const index = await listSkillIndex(session.userId);
  return NextResponse.json({ skills: index, signedIn: true });
}

export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required to manage skills" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    action?: unknown;
    name?: unknown;
    enabled?: unknown;
    markdown?: unknown;
  };

  const action = typeof b.action === "string" ? b.action : "";
  const prefs = await readUserSkillPrefs(session.userId);

  if (action === "toggle") {
    const name = typeof b.name === "string" ? b.name.trim().toLowerCase() : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const enabled = b.enabled !== false;

    const all = await resolveUserSkills(session.userId);
    const skill = all.find((s) => s.name === name);
    if (!skill) return NextResponse.json({ error: "Unknown skill" }, { status: 404 });

    if (skill.source === "builtin") {
      const set = new Set(prefs.disabledBuiltins);
      if (enabled) set.delete(name);
      else set.add(name);
      prefs.disabledBuiltins = [...set];
    } else {
      prefs.custom = prefs.custom.map((c) =>
        c.name === name ? { ...c, enabled } : c,
      );
    }
    await writeUserSkillPrefs(session.userId, prefs);
    return NextResponse.json({ ok: true, skills: await listSkillIndex(session.userId) });
  }

  if (action === "import") {
    const markdown = typeof b.markdown === "string" ? b.markdown : "";
    const parsed = parseSkillMarkdown(markdown, "custom", true);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    prefs.custom = [
      ...prefs.custom.filter((c) => c.name !== parsed.name),
      {
        name: parsed.name,
        description: parsed.description,
        body: parsed.body,
        argumentHint: parsed.argumentHint,
        enabled: true,
      },
    ].slice(0, 30);
    await writeUserSkillPrefs(session.userId, prefs);
    return NextResponse.json({
      ok: true,
      skill: { name: parsed.name, description: parsed.description },
      skills: await listSkillIndex(session.userId),
    });
  }

  if (action === "export") {
    const name = typeof b.name === "string" ? b.name.trim().toLowerCase() : "";
    const all = await resolveUserSkills(session.userId);
    const skill = all.find((s) => s.name === name);
    if (!skill) return NextResponse.json({ error: "Unknown skill" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      name: skill.name,
      markdown: serializeSkillMarkdown(skill),
    });
  }

  if (action === "delete") {
    const name = typeof b.name === "string" ? b.name.trim().toLowerCase() : "";
    prefs.custom = prefs.custom.filter((c) => c.name !== name);
    await writeUserSkillPrefs(session.userId, prefs);
    return NextResponse.json({ ok: true, skills: await listSkillIndex(session.userId) });
  }

  return NextResponse.json(
    { error: "action must be toggle|import|export|delete" },
    { status: 400 },
  );
}
