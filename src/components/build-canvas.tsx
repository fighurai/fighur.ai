"use client";

import { useCallback, useMemo, useState } from "react";

import { activeBuildFile } from "@/lib/build-artifact";
import { extractCanvasSections, type CanvasSection } from "@/lib/canvas-sections";
import type { ChatBuildArtifact } from "@/lib/chat-types";
import {
  composePreviewDocument,
  openPreviewInNewTab,
  PREVIEW_DEVICE_WIDTHS,
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
};

const DEVICE_LABELS: Record<PreviewDevice, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

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
}: BuildCanvasProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const previewImageUrl = useMemo(() => resolveImagePreviewUrl(artifact), [artifact]);
  const activeFile = useMemo(
    () => (artifact ? activeBuildFile(artifact, selectedPath) : null),
    [artifact, selectedPath],
  );
  const preview = useMemo(
    () => composePreviewDocument(artifact, activeFile),
    [artifact, activeFile],
  );

  const canPreviewImage = Boolean(previewImageUrl);
  const canPreviewHtml = !canPreviewImage && preview.mode === "html" && Boolean(preview.doc);
  const canPreviewReact = !canPreviewImage && preview.mode === "react" && Boolean(preview.doc);
  const canPreviewInteractive = canPreviewHtml || canPreviewReact;
  const buildFileList = artifact?.files ?? [];
  const canvasSections = useMemo(() => {
    if (!canPreviewHtml || !activeFile?.code) return [];
    return extractCanvasSections(activeFile.code);
  }, [canPreviewHtml, activeFile?.code]);

  const refreshPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  const openExternal = useCallback(() => {
    if (preview.doc) openPreviewInNewTab(preview.doc);
  }, [preview.doc]);

  const shellClass =
    variant === "sidebar"
      ? "hidden w-[min(44rem,46vw)] shrink-0 border-l border-white/[0.08] bg-[var(--bg-elevated)]/80 backdrop-blur-md md:flex md:flex-col"
      : "fixed inset-x-0 bottom-0 top-20 z-[95] border-t border-white/[0.08] bg-[var(--bg-elevated)]/95 backdrop-blur-md md:hidden flex flex-col";

  const bodyClass =
    variant === "sidebar"
      ? "min-h-0 flex-1 overflow-auto p-3"
      : "min-h-0 flex-1 overflow-auto p-3";

  return (
    <aside className={`${shellClass} ${fullscreen ? "!fixed !inset-0 !z-[200] !w-full !max-w-none" : ""}`}>
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Canvas</p>
          <p className="text-[0.65rem] text-[var(--text-faint)]">Engineered preview · Multi-file · Export</p>
        </div>
        <div className="flex items-center gap-1">
          {canPreviewInteractive ? (
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              {fullscreen ? "Exit" : "Fullscreen"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <button
          type="button"
          onClick={() => onTabChange("preview")}
          className={`rounded-full px-3 py-1 text-xs ${
            tab === "preview"
              ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-white/[0.06]"
          }`}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => onTabChange("code")}
          className={`rounded-full px-3 py-1 text-xs ${
            tab === "code"
              ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-white/[0.06]"
          }`}
        >
          Code
        </button>

        {canPreviewInteractive ? (
          <div className="ml-1 flex flex-wrap items-center gap-1 border-l border-white/[0.08] pl-2">
            {(Object.keys(DEVICE_LABELS) as PreviewDevice[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={`rounded-full px-2 py-0.5 text-[0.65rem] ${
                  device === d
                    ? "bg-white/[0.1] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-white/[0.06]"
                }`}
              >
                {DEVICE_LABELS[d]}
              </button>
            ))}
            <button
              type="button"
              onClick={refreshPreview}
              className="rounded-full px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={openExternal}
              className="rounded-full px-2 py-0.5 text-[0.65rem] text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Open tab
            </button>
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
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
              className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-primary)] hover:bg-white/[0.08]"
            >
              Download
            </button>
          ) : null}
          {previewImageUrl ? (
            <button
              type="button"
              onClick={() => void downloadImageUrl(previewImageUrl)}
              className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
            >
              Download image
            </button>
          ) : null}
        </div>
      </div>

      <div className={bodyClass}>
        {tab === "preview" ? (
          canPreviewImage ? (
            <img
              src={previewImageUrl!}
              alt="Generated preview"
              className="mx-auto max-h-[min(70vh,36rem)] w-full rounded-xl border border-white/[0.12] bg-black/20 object-contain"
            />
          ) : canPreviewInteractive ? (
            <div className="flex min-h-[24rem] flex-1 flex-col gap-2">
              {artifact?.incomplete ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                  Live preview — still generating. The page updates as more code arrives.
                </p>
              ) : null}
              {canPreviewReact ? (
                <p className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100/90">
                  React preview — single-file components with Tailwind supported.
                </p>
              ) : null}
              {canvasSections.length > 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 p-2">
                  <p className="mb-2 px-1 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                    Edit section
                  </p>
                  <div className="flex flex-wrap gap-1.5">
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
                        Edit in chat →
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-1 justify-center">
                <div
                  className="h-full min-h-[24rem] w-full transition-[max-width] duration-200"
                  style={{
                    maxWidth: PREVIEW_DEVICE_WIDTHS[device]
                      ? `${PREVIEW_DEVICE_WIDTHS[device]}px`
                      : "100%",
                  }}
                >
                  <iframe
                    key={previewKey}
                    title="Canvas preview"
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    srcDoc={preview.doc}
                    className="h-full min-h-[24rem] w-full rounded-xl border border-white/[0.12] bg-white shadow-2xl shadow-black/30"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
              {artifact
                ? "Preview bundles index.html + styles.css + main.js. Ask for an intricate multi-file site."
                : "Canvas opens for engineered websites. Describe layout, motion, and sections you want."}
            </div>
          )
        ) : tab === "code" && artifact && activeFile ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {buildFileList.length > 1 ? (
              <>
                <p className="text-[0.65rem] text-[var(--text-muted)]">
                  {buildFileList.length} project files — preview bundles HTML + CSS + JS.
                </p>
                <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-2">
                  {buildFileList.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => onSelectPath(f.path)}
                      className={`max-w-full truncate rounded-lg px-2 py-1 text-[0.65rem] ${
                        (selectedPath ?? activeFile.path) === f.path
                          ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] hover:bg-white/[0.06]"
                      }`}
                      title={f.path}
                    >
                      {f.path}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <pre className="min-h-[20rem] flex-1 overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-3 text-[0.72rem] leading-relaxed text-[var(--text-primary)]">
              <code>{activeFile.code}</code>
            </pre>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
            No code yet. Ask for an intricate multi-file website (HTML + CSS + JS) or React component.
          </div>
        )}
      </div>
    </aside>
  );
}
