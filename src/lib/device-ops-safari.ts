import type { DeviceOpsPayload } from "@/lib/device-ops-parse";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Bash script for Safari users: Finder folder picker + mv/mkdir (double-click .command on Mac). */
export function buildSafariOrganizeScript(
  payload: DeviceOpsPayload,
  rootName: string,
): string {
  const hint = rootName.replace(/"/g, '\\"');
  const lines: string[] = [
    "#!/bin/bash",
    "set -euo pipefail",
    `ROOT_HINT="${hint}"`,
    'echo ""',
    'echo "FIGHURAI — organize files in your folder"',
    'echo "Expected folder name (hint): $ROOT_HINT"',
    'echo ""',
    'TARGET=$(osascript -e "POSIX path of (choose folder with prompt \\"Select the folder to organize\\")")',
    'TARGET="${TARGET%/}"',
    'cd "$TARGET" || exit 1',
    'echo "Working in: $TARGET"',
    'echo ""',
  ];

  for (const op of payload.ops) {
    if (op.op === "mkdir") {
      lines.push(`mkdir -p ${shellQuote(op.path)}`);
      continue;
    }
    if (op.op === "rename") {
      const idx = op.path.lastIndexOf("/");
      const toPath = idx >= 0 ? `${op.path.slice(0, idx + 1)}${op.newName}` : op.newName;
      lines.push(`mv ${shellQuote(op.path)} ${shellQuote(toPath)}`);
      continue;
    }
    if (op.op === "move") {
      const toParts = splitPath(op.to);
      if (toParts.dirs.length) {
        lines.push(`mkdir -p ${shellQuote(toParts.dirs.join("/"))}`);
      }
      lines.push(`mv ${shellQuote(op.from)} ${shellQuote(op.to)}`);
    }
  }

  lines.push(
    'echo ""',
    'echo "Done — your files are organized."',
    'osascript -e \'display notification "Organization finished" with title "FIGHURAI"\' 2>/dev/null || true',
    'read -r -p "Press Enter to close…" _',
  );
  return lines.join("\n");
}

function splitPath(p: string): { dirs: string[]; name: string } {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return { dirs: [], name: "" };
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] ?? "" };
}

export function downloadSafariOrganizeScript(
  payload: DeviceOpsPayload,
  rootName: string,
): void {
  if (typeof document === "undefined") return;
  const body = buildSafariOrganizeScript(payload, rootName);
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fighur-organize.command";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua);
}