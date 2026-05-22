"use client";

import { PRIVACY_WAIVER_BODY } from "@/lib/privacy-waiver";

type Props = {
  open: boolean;
  title: string;
  onAccept: () => void;
  onCancel: () => void;
};

export function PrivacyWaiverModal({ open, title, onAccept, onCancel }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-waiver-title"
    >
      <div className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.12] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <h2 id="privacy-waiver-title" className="text-base font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
          Privacy & data access
        </p>
        <div className="mt-3 whitespace-pre-wrap text-[0.8rem] leading-relaxed text-[var(--text-muted)]">
          {PRIVACY_WAIVER_BODY}
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm text-[var(--text-muted)] hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-xl bg-[var(--accent)]/20 px-4 py-2.5 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/35 hover:bg-[var(--accent)]/30"
          >
            I agree — continue
          </button>
        </div>
      </div>
    </div>
  );
}
