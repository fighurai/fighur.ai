"use client";

type StreamLoadingDotsProps = {
  /** Match the scroll-to-bottom FAB size and placement. */
  variant?: "inline" | "fab";
};

/** Loading indicator — dots cycle hue continuously (no fixed per-dot colors). */
export function StreamLoadingDots({ variant = "inline" }: StreamLoadingDotsProps) {
  const isFab = variant === "fab";

  return (
    <div
      className={
        isFab
          ? "stream-loading-fab"
          : "stream-loading-dots py-1"
      }
      role="status"
      aria-live="polite"
      aria-label="FIGHURAI is replying"
    >
      <span className="stream-loading-dot" aria-hidden />
      <span className="stream-loading-dot" aria-hidden />
      <span className="stream-loading-dot" aria-hidden />
    </div>
  );
}
