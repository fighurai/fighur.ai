export type DeviceFileOp =
  | { op: "move"; from: string; to: string }
  | { op: "rename"; path: string; newName: string }
  | { op: "mkdir"; path: string };

export type DeviceOpsPayload = {
  ops: DeviceFileOp[];
  summary?: string;
};

const MAX_OPS = 40;

function coerceOpsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { ops?: unknown }).ops)) {
        return (parsed as { ops: unknown[] }).ops;
      }
    } catch {
      /* ignore */
    }
    return [];
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.ops)) return o.ops;
    if (Array.isArray(o.operations)) return o.operations;
    if (Array.isArray(o.moves)) return o.moves;
  }
  return [];
}

function normalizeOneOp(raw: unknown): DeviceFileOp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.op ?? o.operation ?? o.type ?? o.action ?? "")
    .toLowerCase()
    .trim();

  if (kind === "move" || kind === "mv") {
    const from = o.from ?? o.source ?? o.src ?? o.from_path ?? o.fromPath;
    const to = o.to ?? o.destination ?? o.dest ?? o.to_path ?? o.toPath;
    if (typeof from === "string" && typeof to === "string" && from.trim() && to.trim()) {
      return { op: "move", from: from.trim(), to: to.trim() };
    }
    return null;
  }

  if (kind === "rename") {
    const path = o.path ?? o.from ?? o.file;
    const newName = o.newName ?? o.new_name ?? o.to ?? o.name;
    if (typeof path === "string" && typeof newName === "string" && path.trim() && newName.trim()) {
      return { op: "rename", path: path.trim(), newName: newName.trim() };
    }
    return null;
  }

  if (kind === "mkdir" || kind === "mkdirs" || kind === "folder" || kind === "directory") {
    const path = o.path ?? o.dir ?? o.folder ?? o.name ?? o.to;
    if (typeof path === "string" && path.trim()) {
      return { op: "mkdir", path: path.trim() };
    }
    return null;
  }

  return null;
}

function validateOpsList(raw: unknown): DeviceFileOp[] | null {
  const list = coerceOpsArray(raw)
    .map(normalizeOneOp)
    .filter((o): o is DeviceFileOp => o !== null)
    .slice(0, MAX_OPS);
  return list.length ? list : null;
}

/** Lenient parse for propose_device_file_ops tool input (models vary field names). */
export function deviceOpsFromToolInput(input: Record<string, unknown>): DeviceOpsPayload | null {
  let rawOps: unknown = input.ops;
  if (rawOps === undefined && typeof input.ops_json === "string") {
    rawOps = input.ops_json;
  }
  if (rawOps === undefined && typeof input.plan === "string") {
    rawOps = input.plan;
  }
  const ops = validateOpsList(rawOps);
  if (!ops) return null;
  const summary =
    typeof input.summary === "string"
      ? input.summary.trim()
      : typeof input.description === "string"
        ? input.description.trim()
        : undefined;
  return { ops, summary: summary || undefined };
}

export function parseDeviceOpsFromText(text: string): DeviceOpsPayload | null {
  const fence = /```device-ops\s*\r?\n([\s\S]*?)```/i.exec(text);
  if (!fence) return null;
  try {
    const json = JSON.parse(fence[1].trim()) as DeviceOpsPayload & { ops?: unknown };
    if (!json || typeof json !== "object") return null;
    const ops = validateOpsList(json.ops);
    return ops
      ? {
          ops,
          summary: typeof json.summary === "string" ? json.summary : undefined,
        }
      : null;
  } catch {
    return null;
  }
}

export function formatDeviceOpsFence(payload: DeviceOpsPayload): string {
  return `\n\n\`\`\`device-ops\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}
