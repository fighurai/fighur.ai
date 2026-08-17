"use client";

type HomeLandingIntroProps = {
  onStartTutorial: () => void;
};

export function HomeLandingIntro({ onStartTutorial }: HomeLandingIntroProps) {
  return (
    <div className="mx-auto mb-5 flex w-full max-w-2xl justify-center px-3 sm:mb-6 sm:px-4">
      <button
        type="button"
        onClick={onStartTutorial}
        className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_28px_var(--accent-glow)] transition hover:brightness-110"
      >
        Quick tutorial
      </button>
    </div>
  );
}
