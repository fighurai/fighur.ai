"use client";

import type { DeviceOpsPayload } from "@/lib/device-file-ops";

type Props = {
  open: boolean;
  payload: DeviceOpsPayload | null;
  applying: boolean;
  resultMessage: string | null;
  canWrite: boolean;
  onApply: () => void;
  onCancel: () => void;
};

export function DeviceOpsModal({
  open,
  payload,
  applying,
  resultMessage,
  canWrite,
  onApply,
  onCancel,
}: Props) {
  if (!open || !payload) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-ops-title"
    >
      <div className="max-h-[min(90vh,28rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.12] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <h2 id="device-ops-title" className="text-base font-semibold text-[var(--text-primary)]">
          Organize files on this device?
        </h2>
        {payload.summary ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{payload.summary}</p>
        ) : null}
        {!canWrite ? (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
            Live renames need Chrome or Edge with write access. Reconnect the folder in Settings and
            allow edit permission, or use a Safari snapshot only for planning.
          </p>
        ) : null}
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--text-muted)]">
          {payload.ops.map((op, i) => (
            <li key={i} className="rounded-md bg-white/[0.04] px-2 py-1 font-mono">
              {op.op === "move"
                ? `Move: ${op.from} → ${op.to}`
                : op.op === "rename"
                  ? `Rename: ${op.path} → ${op.newName}`
                  : `New folder: ${op.path}`}
            </li>
          ))}
        </ul>
        {resultMessage ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">{resultMessage}</p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm text-[var(--text-muted)] hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying || !canWrite}
            className="rounded-xl bg-[var(--accent)]/20 px-4 py-2.5 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/35 hover:bg-[var(--accent)]/30 disabled:opacity-50"
          >
            {applying ? "Applying…" : `Apply ${payload.ops.length} change${payload.ops.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
