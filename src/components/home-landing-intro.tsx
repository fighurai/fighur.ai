"use client";

type HomeLandingIntroProps = {
  onStartTutorial: () => void;
};

/** Floats above the centered prompt — does not push the composer down. */
export function HomeLandingIntro({ onStartTutorial }: HomeLandingIntroProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3 sm:top-4 sm:px-4">
      <button
        type="button"
        onClick={onStartTutorial}
        className="pointer-events-auto inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_28px_var(--accent-glow)] transition hover:brightness-110"
      >
        Quick tutorial
      </button>
    </div>
  );
}
