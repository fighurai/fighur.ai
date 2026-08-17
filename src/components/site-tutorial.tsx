"use client";

import { useCallback, useEffect, useId, useState } from "react";

const STEPS = [
  {
    title: "Colors",
    body: "Open Colors in the top-right to paint the whole page — pick a background and text color, or turn custom colors off to return to the default look (and the soft ombré wash on the home screen).",
  },
  {
    title: "Layout",
    body: "Layout lets you flip where the chat sidebar and Canvas sit (left or right) so the workspace matches how you work.",
  },
  {
    title: "Agents",
    body: "Agents switches which AI personality you’re talking to. Create and manage agents from Settings when you’re signed in.",
  },
  {
    title: "Settings",
    body: "Settings is home for skills, connectors, apps, MCP, and more — the deeper controls behind FIGHURAI.",
  },
  {
    title: "Prompt bar",
    body: "Type in the box to chat. Speak turns voice into text, Attach adds files or images, and Send submits. Workspace / Canvas opens after you start building.",
  },
] as const;

type SiteTutorialProps = {
  open: boolean;
  onClose: () => void;
  /** Fired when the user finishes or skips the tutorial. */
  onFinished?: () => void;
};

export function SiteTutorial({ open, onClose, onFinished }: SiteTutorialProps) {
  const titleId = useId();
  const [step, setStep] = useState(0);

  const finish = useCallback(() => {
    onFinished?.();
    onClose();
  }, [onClose, onFinished]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish]);

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        finish();
        return s;
      }
      return s + 1;
    });
  }, [finish]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close tutorial"
        onClick={finish}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.12] bg-[var(--bg-elevated)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.55)] sm:p-6"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Quick tutorial · {step + 1}/{STEPS.length}
        </p>
        <h2
          id={titleId}
          className="mt-2 font-display text-xl font-medium tracking-tight text-[var(--text-primary)]"
        >
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{current.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-full px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-white/[0.12] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
              onClick={finish}
            >
              Skip
            </button>
            <button
              type="button"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110"
              onClick={next}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
