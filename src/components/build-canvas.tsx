"use client";

import Markdown from "react-markdown";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { activeBuildFile, isDocumentArtifact } from "@/lib/build-artifact";
import { extractCanvasSections, type CanvasSection } from "@/lib/canvas-sections";
import type { ChatBuildArtifact } from "@/lib/chat-types";
import {
  composePreviewDocument,
  openPreviewInNewTab,
  PREVIEW_DEVICES,
  type PreviewDevice,
} from "@/lib/html-preview";
import {
  downloadBuildCode,
  downloadImageUrl,
  isImageArtifact,
  resolveImagePreviewUrl,
} from "@/lib/workspace-download";

type BuildPanelTab = "preview" | "code";

type BuildCanvasProps = {
  artifact: ChatBuildArtifact | null;
  tab: BuildPanelTab;
  onTabChange: (tab: BuildPanelTab) => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
  onEditSection: (section: CanvasSection) => void;
  onClose: () => void;
  variant: "sidebar" | "sheet";
  side?: "left" | "right";
  onResizeWidth?: (widthPx: number) => void;
  columnOrder?: number;
};

function DeviceIcon({ device, active }: { device: PreviewDevice; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  if (device === "mobile") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" stroke={stroke} strokeWidth="1.75" />
        <path d="M11 18h2" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (device === "tablet") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="3" width="16" height="18" rx="2" stroke={stroke} strokeWidth="1.75" />
        <path d="M11 17h2" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="1.5" stroke={stroke} strokeWidth="1.75" />
      <path d="M8 20h8M12 17v3" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function PreviewFrame({
  device,
  previewKey,
  srcDoc,
  pointerEvents,
}: {
  device: PreviewDevice;
  previewKey: number;
  srcDoc: string;
  pointerEvents: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const meta = PREVIEW_DEVICES[device];
  const frameW = meta.width ?? 1200;
  const frameH = meta.height ?? 800;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const pad = 32;
      const availW = Math.max(120, el.clientWidth - pad);
      const availH = Math.max(160, el.clientHeight - pad);
      if (meta.kind === "browser") {
        setScale(1);
        return;
      }
      const s = Math.min(1, availW / frameW, availH / frameH);
      setScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device, frameW, frameH, meta.kind]);

  if (meta.kind === "browser") {
    return (
      <div ref={stageRef} className="flex h-full min-h-0 w-full flex-1 flex-col p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#0c0d12] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#14151c] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-2 flex min-w-0 flex-1 items-center rounded-md border border-white/[0.08] bg-black/30 px-2.5 py-1">
              <span className="truncate text-[0.65rem] text-[var(--text-faint)]">fighur.ai/preview</span>
            </div>
          </div>
          <iframe
            key={previewKey}
            title="Canvas preview"
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            srcDoc={srcDoc}
            className={`min-h-0 w-full flex-1 bg-white ${pointerEvents ? "" : "pointer-events-none"}`}
          />
        </div>
      </div>
    );
  }

  const isPhone = meta.kind === "phone";
  const bezel = isPhone ? 12 : 14;
  const radius = isPhone ? 36 : 22;
  const screenRadius = isPhone ? 28 : 14;

  return (
    <div
      ref={stageRef}
      className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),transparent_65%)] p-4"
    >
      <div
        style={{
          width: frameW * scale,
          height: frameH * scale,
        }}
        className="relative"
      >
        <div
          className="origin-top-left"
          style={{
            width: frameW,
            height: frameH,
            transform: `scale(${scale})`,
          }}
        >
          <div
            className="relative h-full w-full bg-[#1a1b22] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            style={{
              padding: bezel,
              borderRadius: radius,
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.08), 0 24px 80px rgba(0,0,0,0.55)",
            }}
          >
            {isPhone ? (
              <div className="pointer-events-none absolute left-1/2 top-[18px] z-10 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-black/90" />
            ) : null}
            <div
              className="relative h-full w-full overflow-hidden bg-white"
              style={{ borderRadius: screenRadius }}
            >
              <iframe
                key={previewKey}
                title="Canvas preview"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                srcDoc={srcDoc}
                className={`h-full w-full border-0 bg-white ${pointerEvents ? "" : "pointer-events-none"}`}
              />
            </div>
            {isPhone ? (
              <div className="pointer-events-none absolute bottom-[18px] left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/35" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BuildCanvas({
  artifact,
  tab,
  onTabChange,
  selectedPath,
  onSelectPath,
  selectedSectionId,
  onSelectSection,
  onEditSection,
  onClose,
  variant,
  side = "right",
  onResizeWidth,
  columnOrder,
}: BuildCanvasProps) {
  const isSheet = variant === "sheet";
  const [device, setDevice] = useState<PreviewDevice>(isSheet ? "mobile" : "desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const previewImageUrl = useMemo(() => resolveImagePreviewUrl(artifact), [artifact]);
  const isDocument = isDocumentArtifact(artifact);
  const activeFile = useMemo(
    () => (artifact ? activeBuildFile(artifact, selectedPath) : null),
    [artifact, selectedPath],
  );
  const preview = useMemo(
    () => composePreviewDocument(artifact, activeFile),
    [artifact, activeFile],
  );

  const canPreviewImage = Boolean(previewImageUrl);
  const canPreviewDocument = isDocument && Boolean(activeFile?.code?.trim());
  const canPreviewHtml =
    !canPreviewImage && !canPreviewDocument && preview.mode === "html" && Boolean(preview.doc);
  const canPreviewReact =
    !canPreviewImage && !canPreviewDocument && preview.mode === "react" && Boolean(preview.doc);
  const canPreviewInteractive = canPreviewHtml || canPreviewReact;
  const buildFileList = artifact?.files ?? [];
  const canvasSections = useMemo(() => {
    if (!canPreviewHtml || !activeFile?.code) return [];
    return extractCanvasSections(activeFile.code);
  }, [canPreviewHtml, activeFile?.code]);

  const documentMarkdown = activeFile?.code ?? artifact?.code ?? "";

  const copyDocument = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(documentMarkdown);
    } catch {
      /* ignore */
    }
  }, [documentMarkdown]);

  const refreshPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  const openExternal = useCallback(() => {
    if (preview.doc) openPreviewInNewTab(preview.doc);
  }, [preview.doc]);

  useEffect(() => {
    if (!isSheet) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isSheet]);

  const shellClass = isSheet
    ? "fixed inset-0 z-[110] flex flex-col bg-[var(--bg-deep)] md:hidden"
    : `hidden shrink-0 bg-[var(--bg-elevated)]/90 backdrop-blur-md md:flex md:flex-col ${
        side === "left" ? "border-r border-white/[0.08]" : "border-l border-white/[0.08]"
      }`;

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (variant !== "sidebar" || !onResizeWidth || fullscreen) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 480;
    setResizing(true);
    const onMove = (ev: PointerEvent) => {
      const delta = side === "right" ? startX - ev.clientX : ev.clientX - startX;
      onResizeWidth(startW + delta);
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      className={`relative ${shellClass} ${fullscreen ? "!fixed !inset-0 !z-[200] !w-full !max-w-none" : ""} ${resizing ? "select-none" : ""}`}
      style={
        variant === "sidebar" && !fullscreen
          ? { width: "var(--canvas-w)", maxWidth: "100%", order: columnOrder }
          : isSheet
            ? {
                paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }
            : undefined
      }
      {...(isSheet
        ? { role: "dialog" as const, "aria-modal": true as const, "aria-label": "Canvas" }
        : {})}
    >
      {variant === "sidebar" && onResizeWidth && !fullscreen ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize canvas"
          onPointerDown={startResize}
          className={`absolute top-0 z-10 hidden h-full w-1.5 cursor-col-resize touch-none md:block ${
            side === "right" ? "left-0" : "right-0"
          } ${resizing ? "bg-[var(--accent)]/40" : "bg-transparent hover:bg-[var(--accent)]/25"}`}
        />
      ) : null}

      {/* Compact chrome — sheet is a full-page canvas view on phones */}
      <div
        className={`flex shrink-0 flex-col border-b border-white/[0.08] bg-[var(--bg-elevated)] ${
          isSheet ? "gap-2 px-3 py-2.5" : "gap-2 px-2.5 py-2"
        }`}
      >
        <div className="flex items-center gap-2">
          {isSheet ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              aria-label="Back to chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Chat
            </button>
          ) : null}
          <p className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
            {isDocument ? "Document" : "Canvas"}
          </p>
          {artifact?.incomplete ? (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400"
              title="Still generating"
            />
          ) : null}

          {!isSheet ? (
            <div className="ml-1 flex items-center rounded-lg bg-black/25 p-0.5">
              {(["preview", "code"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTabChange(t)}
                  className={`rounded-md px-2.5 py-1 text-[0.7rem] capitalize ${
                    tab === t
                      ? "bg-white/[0.1] font-medium text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {isDocument && t === "preview" ? "Document" : isDocument && t === "code" ? "Source" : t}
                </button>
              ))}
            </div>
          ) : null}

          {/* Device picker stays desktop-sidebar only — phone sheet is already a phone */}
          {!isSheet && tab === "preview" && canPreviewInteractive ? (
            <div className="flex items-center rounded-lg bg-black/25 p-0.5">
              {(Object.keys(PREVIEW_DEVICES) as PreviewDevice[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  title={PREVIEW_DEVICES[d].label}
                  onClick={() => setDevice(d)}
                  className={`flex items-center justify-center rounded-md px-2 py-1 ${
                    device === d
                      ? "bg-white/[0.12] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <DeviceIcon device={d} active={device === d} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-0.5">
            {!isSheet && tab === "preview" && canPreviewDocument ? (
              <>
                <button
                  type="button"
                  onClick={() => void copyDocument()}
                  className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  title="Copy document"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreen((v) => !v)}
                  className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                >
                  {fullscreen ? "Exit" : "Fullscreen"}
                </button>
              </>
            ) : null}

            {!isSheet && tab === "preview" && canPreviewInteractive ? (
              <>
                <button
                  type="button"
                  onClick={refreshPreview}
                  className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  title="Refresh preview"
                >
                  Refresh
                </button>
                {canvasSections.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSectionsOpen((v) => !v)}
                    className={`rounded-md px-2 py-1 text-[0.7rem] ${
                      sectionsOpen
                        ? "bg-white/[0.08] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-white/[0.06]"
                    }`}
                  >
                    Sections
                  </button>
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06]"
                    aria-expanded={moreOpen}
                  >
                    ···
                  </button>
                  {moreOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-white/[0.1] bg-[var(--bg-elevated)] py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setFullscreen((v) => !v);
                          setMoreOpen(false);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                      >
                        {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openExternal();
                          setMoreOpen(false);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                      >
                        Open in tab
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {isSheet ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="rounded-md px-2.5 py-1.5 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06]"
                  aria-expanded={moreOpen}
                >
                  More
                </button>
                {moreOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/[0.1] bg-[var(--bg-elevated)] py-1 shadow-xl">
                    {tab === "preview" && canPreviewDocument ? (
                      <button
                        type="button"
                        onClick={() => {
                          void copyDocument();
                          setMoreOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                      >
                        Copy document
                      </button>
                    ) : null}
                    {tab === "preview" && canPreviewInteractive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            refreshPreview();
                            setMoreOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                        >
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            openExternal();
                            setMoreOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                        >
                          Open in tab
                        </button>
                        {canvasSections.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSectionsOpen((v) => !v);
                              setMoreOpen(false);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                          >
                            {sectionsOpen ? "Hide sections" : "Sections"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {artifact && !isImageArtifact(artifact) && activeFile ? (
                      <button
                        type="button"
                        onClick={() => {
                          downloadBuildCode({
                            language: activeFile.language,
                            code: activeFile.code,
                            primaryPath: activeFile.path,
                          });
                          setMoreOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                      >
                        {isDocument ? "Download document" : "Download code"}
                      </button>
                    ) : null}
                    {previewImageUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadImageUrl(previewImageUrl);
                          setMoreOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10"
                      >
                        Save image
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {artifact && !isImageArtifact(artifact) && activeFile ? (
                  <button
                    type="button"
                    onClick={() =>
                      downloadBuildCode({
                        language: activeFile.language,
                        code: activeFile.code,
                        primaryPath: activeFile.path,
                      })
                    }
                    className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Download
                  </button>
                ) : null}
                {previewImageUrl ? (
                  <button
                    type="button"
                    onClick={() => void downloadImageUrl(previewImageUrl)}
                    className="rounded-md px-2 py-1 text-[0.7rem] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  >
                    Save
                  </button>
                ) : null}
              </>
            )}

            {!isSheet ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.06]"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>

        {isSheet ? (
          <div className="flex w-full items-center rounded-lg bg-black/25 p-0.5">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange(t)}
                className={`min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-center text-[0.7rem] capitalize ${
                  tab === t
                    ? "bg-white/[0.1] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {isDocument && t === "preview" ? "Document" : isDocument && t === "code" ? "Source" : t}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Optional section strip — collapsed by default */}
      {tab === "preview" && sectionsOpen && canvasSections.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-2">
          {canvasSections.map((section) => {
            const active = selectedSectionId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(active ? null : section.id)}
                onDoubleClick={() => onEditSection(section)}
                className={`rounded-full px-2.5 py-1 text-[0.65rem] ${
                  active
                    ? "bg-[var(--accent)]/25 text-[var(--text-primary)] ring-1 ring-[var(--accent)]/40"
                    : "bg-white/[0.06] text-[var(--text-muted)] hover:bg-white/[0.1]"
                }`}
                title={`Double-click to edit ${section.label}`}
              >
                {section.label}
              </button>
            );
          })}
          {selectedSectionId ? (
            <button
              type="button"
              onClick={() => {
                const section = canvasSections.find((s) => s.id === selectedSectionId);
                if (section) onEditSection(section);
              }}
              className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--accent-foreground)]"
            >
              Edit →
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Stage */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          isSheet ? "pb-[env(safe-area-inset-bottom,0px)]" : ""
        }`}
      >
        {tab === "preview" ? (
          canPreviewImage ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <img
                src={previewImageUrl!}
                alt="Generated preview"
                className="max-h-full max-w-full rounded-xl border border-white/[0.12] bg-black/20 object-contain shadow-2xl"
              />
            </div>
          ) : canPreviewDocument ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.04),_transparent_55%)]">
              <article
                className={`workspace-doc studio-md mx-auto w-full max-w-[42rem] px-5 py-8 text-[var(--text-primary)] sm:px-8 sm:py-10 ${
                  isSheet ? "text-[0.95rem]" : "text-[0.9375rem]"
                }`}
              >
                <Markdown>{documentMarkdown}</Markdown>
              </article>
            </div>
          ) : canPreviewInteractive && preview.doc ? (
            isSheet ? (
              <MobileSheetPreview
                previewKey={previewKey}
                srcDoc={preview.doc}
                pointerEvents={!resizing}
              />
            ) : (
              <PreviewFrame
                device={device}
                previewKey={previewKey}
                srcDoc={preview.doc}
                pointerEvents={!resizing}
              />
            )
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-2xl border border-dashed border-white/[0.12] bg-black/20 px-6 py-10">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {isDocument ? "No document yet" : "No preview yet"}
                </p>
                <p className="mt-2 max-w-[16rem] text-xs leading-relaxed text-[var(--text-muted)]">
                  {isDocument
                    ? "Ask for research, a script, or a report — the rendered document appears here."
                    : "Ask for a document, site, or app — the Workspace preview appears here."}
                </p>
              </div>
            </div>
          )
        ) : tab === "code" && artifact && activeFile ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {buildFileList.length > 1 ? (
              <div
                className={`flex shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-black/20 py-2 ${
                  isSheet ? "w-[5.75rem]" : "w-[7.5rem]"
                }`}
              >
                {buildFileList.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => onSelectPath(f.path)}
                    className={`truncate px-2.5 py-1.5 text-left text-[0.65rem] ${
                      (selectedPath ?? activeFile.path) === f.path
                        ? "bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                    }`}
                    title={f.path}
                  >
                    {f.path.split("/").pop()}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <div className="sticky top-0 z-[1] border-b border-white/[0.06] bg-[var(--bg-elevated)]/95 px-3 py-1.5 backdrop-blur">
                <p className="truncate text-[0.65rem] text-[var(--text-faint)]">
                  {activeFile.path}
                  <span className="ml-2 uppercase opacity-70">{activeFile.language}</span>
                </p>
              </div>
              <pre
                className={`p-3 leading-relaxed text-[var(--text-primary)] ${
                  isSheet ? "text-[0.8rem]" : "text-[0.72rem]"
                }`}
              >
                <code>{activeFile.code}</code>
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            No code yet.
          </div>
        )}
      </div>
    </aside>
  );
}

/** Full-bleed preview for the phone sheet — no nested desktop/phone chrome. */
function MobileSheetPreview({
  previewKey,
  srcDoc,
  pointerEvents,
}: {
  previewKey: number;
  srcDoc: string;
  pointerEvents: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <iframe
        key={previewKey}
        title="Canvas preview"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={srcDoc}
        className={`min-h-0 w-full flex-1 border-0 bg-white ${pointerEvents ? "" : "pointer-events-none"}`}
      />
    </div>
  );
}
