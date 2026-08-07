/** Shared panel chrome for header dropdowns — fixed sheet on phone, anchored dropdown on desktop. */
export const HEADER_PANEL_CLASS =
  "fixed inset-x-3 top-[3.75rem] z-[220] flex max-h-[min(70dvh,calc(100dvh-4.5rem))] w-auto flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl " +
  "md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+0.5rem)] md:z-[60] md:max-h-[min(42rem,82vh)]";

export const HEADER_PANEL_BACKDROP_CLASS =
  "fixed inset-0 z-[210] bg-black/55 backdrop-blur-[2px] md:hidden";

export const HEADER_TRIGGER_CLASS =
  "relative z-[1] shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)] sm:px-3";
