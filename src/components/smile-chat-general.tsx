"use client";

import Link from "next/link";
import Markdown from "react-markdown";
import type { ChangeEvent, DragEvent, MouseEvent } from "react";
import type { Components } from "react-markdown";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { flushSync } from "react-dom";

import type { ChatBuildArtifact, ChatMessage } from "@/lib/chat-types";
import { promptRequestsBuildWorkspace } from "@/lib/infer-builder-target";
import {
  applyLayoutCssVars,
  composerDockInsets,
  defaultLayoutPrefs,
  LAYOUT_CHANGE_EVENT,
  layoutColumnOrders,
  MAX_CANVAS_WIDTH_PX,
  MIN_CANVAS_WIDTH_PX,
  MIN_SIDEBAR_WIDTH_PX,
  MAX_SIDEBAR_WIDTH_PX,
  normalizeLayoutPrefs,
  persistLayout,
  readLayout,
  type LayoutPrefs,
} from "@/lib/layout-storage";
import { syncLayoutToServer } from "@/lib/layout-sync";
import {
  ACTIVE_AGENT_CHANGE_EVENT,
  type ActiveAgentChangeDetail,
} from "@/lib/agents/types";
import {
  clearSession,
  clearSessionAndServer,
  fetchUsageSummary,
  hydrateServerSession,
  readSession,
  readVerifiedServerUserId,
  type SmileSession,
  type UsageSummary,
} from "@/lib/auth-storage";
import { ANONYMOUS_SPEND_LIMIT_USD } from "@/lib/usage-constants";
import {
  readConnectedServices,
  toConnectedServicesPayload,
  writeConnectedServices,
} from "@/lib/connected-services";
import { mergeConversations } from "@/lib/conversation-merge";
import {
  fetchServerConversations,
  saveServerConversations,
} from "@/lib/conversation-sync";
import { syncConnectedServicesFromServer } from "@/lib/connected-services-sync";
import {
  buildDeviceManifestForChat,
  connectDeviceFolder,
  getCachedDeviceDirectoryHandle,
  loadDeviceDirectoryHandle,
} from "@/lib/device-files-client";
import {
  applyDeviceFileOpsWithHandle,
  beginWritePermissionRequest,
  canApplyDeviceFileOps,
  parseDeviceOpsFromText,
  prepareDeviceWriteAccessFromClick,
  type DeviceOpsPayload,
} from "@/lib/device-file-ops";
import { AmbientOmbreBackground } from "@/components/ambient-ombre-background";
import { DeviceOpsModal } from "@/components/device-ops-modal";
import { downloadSafariOrganizeScript } from "@/lib/device-ops-safari";
import { detectBrowserLocation } from "@/lib/browser-geolocation";
import type { UserLocationHint } from "@/lib/client-location";
import { BuildCanvas } from "@/components/build-canvas";
import { extractBuildArtifact, stripCodeFences } from "@/lib/build-artifact";
import type { CanvasSection } from "@/lib/canvas-sections";
import {
  buildClientCanvasContext,
  canvasEditPrefill,
} from "@/lib/client-canvas-context";
import {
  droppedPathHint,
  filesFromDataTransfer,
  processFileForChatAttachment,
} from "@/lib/chat-attachments";
import { HomeLandingIntro } from "@/components/home-landing-intro";
import { videoPreviewDataUrl } from "@/lib/video-attachment";
import { DEFAULT_CHAT_MODEL_ID, PROMPT_PLACEHOLDER } from "@/lib/site-brand";
import {
  downloadImageUrl,
  extractAllImagePreviewUrls,
  resolveImagePreviewUrl,
} from "@/lib/workspace-download";
import { SiteTutorial } from "@/components/site-tutorial";
import { StreamLoadingDots } from "@/components/stream-loading-dots";
import { StreamingText, type StreamingTextHandle } from "@/components/streaming-text";
import { readTheme, type ThemePrefs } from "@/lib/theme-storage";
import {
  hydrateQuickTutorialDoneFromServer,
  persistQuickTutorialDone,
  readQuickTutorialDone,
} from "@/lib/quick-tutorial-storage";
import {
  ANONYMOUS_STORAGE_USER,
  deriveTitle,
  clearConversations,
  conversationStorageUserId,
  liveConversationStorageUser,
  loadConversations,
  loadLastActiveId,
  migrateAnonymousConversationsToUser,
  persistConversations,
  removeConversation,
  saveLastActiveId,
  type SavedConversation,
  upsertConversation,
} from "@/lib/conversation-storage";

type SpeechSession = {
  start: () => void;
  stop: () => void;
};

type ChatModelInfo = {
  id: string;
  label: string;
  provider: string;
  available: boolean;
};

type BuildPanelTab = "preview" | "code";
type BuildArtifact = ChatBuildArtifact;
type PromptAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "text" | "image" | "video" | "binary";
  content: string;
};

const MAX_ATTACHMENTS = 6;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function friendlyChatError(e: unknown): string {
  if (!(e instanceof Error)) return "Something went wrong. Please try again.";
  if (e.name === "AbortError") {
    return "Request timed out. Try a shorter prompt or a faster model.";
  }
  const lower = e.message.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("network error")
  ) {
    return "Connection lost before the reply finished. Check your network and send again.";
  }
  if (/anthropic|api_key|redeploy|vercel/i.test(e.message)) {
    return "Chat is temporarily unavailable. Try again in a moment.";
  }
  return e.message;
}

function isRetryableChatError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError") return false;
  const lower = e.message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("network")
  );
}

function formatTime(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await navigator.clipboard.writeText(trimmed);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = trimmed;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function stripDeviceOpsBlock(text: string): string {
  return text.replace(/```device-ops[\s\S]*?```/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

function finalizeAssistantContent(raw: string): string {
  const trimmed = stripDeviceOpsBlock(raw).trim();
  if (!trimmed) return "I'm here — try that again and I'll answer.";
  const narration = stripCodeFences(trimmed);
  if (narration) return narration;
  if (trimmed.includes("```")) return "Your site is ready in **Canvas** → open the panel on the right.";
  return trimmed;
}

function sanitizeAssistantMessages(list: ChatMessage[]): ChatMessage[] {
  return list.map((m) =>
    m.role === "assistant"
      ? {
          ...m,
          content:
            stripCodeFences(m.content) ||
            (extractAllImagePreviewUrls(m.content).length > 0
              ? m.content
              : "Open **Canvas** on the right for the full preview and code."),
        }
      : m,
  );
}

/** Text to copy — excludes huge base64 payloads and code fences. */
function copyableAssistantText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)]\(data:image\/[^)]+\)/gi, (_, alt: string) =>
      alt?.trim() ? `${alt.trim()} [image — use Download in chat]` : "[image — use Download in chat]",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ChatOutputImage({ src, alt }: { src?: string; alt?: string }) {
  const [downloading, setDownloading] = useState(false);
  if (!src?.trim()) return null;
  return (
    <figure className="my-3 overflow-hidden rounded-xl border border-white/[0.1] bg-black/25">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? "Generated image"}
        className="max-h-[min(70vh,28rem)] w-full object-contain"
      />
      <figcaption className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-3 py-2">
        <span className="truncate text-[0.65rem] text-[var(--text-faint)]">{alt ?? "Generated image"}</span>
        <button
          type="button"
          disabled={downloading}
          onClick={() => {
            setDownloading(true);
            void downloadImageUrl(src, (alt ?? "generated-image").replace(/[^\w.-]+/g, "-").slice(0, 40))
              .catch(() => undefined)
              .finally(() => setDownloading(false));
          }}
          className="shrink-0 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
        >
          {downloading ? "Saving…" : "Download image"}
        </button>
      </figcaption>
    </figure>
  );
}

const assistantMarkdownComponents: Components = {
  img: ({ src, alt }) => (
    <ChatOutputImage src={typeof src === "string" ? src : undefined} alt={alt} />
  ),
};

const AssistantMessageBody = memo(function AssistantMessageBody({
  content,
  isStreaming,
  imageFallback,
  streamTextRef,
  onStreamUpdate,
  onStreamFirstOutput,
}: {
  content: string;
  isStreaming: boolean;
  imageFallback?: string | null;
  streamTextRef?: RefObject<StreamingTextHandle | null>;
  onStreamUpdate?: () => void;
  onStreamFirstOutput?: () => void;
}) {
  const displayContent = useMemo(() => {
    const narration = stripCodeFences(content);
    if (narration) return narration;
    if (imageFallback) return `![Generated image](${imageFallback})`;
    return content;
  }, [content, imageFallback]);

  if (isStreaming) {
    return (
      <StreamingText
        ref={streamTextRef}
        components={assistantMarkdownComponents}
        onUpdate={onStreamUpdate}
        onFirstOutput={onStreamFirstOutput}
      />
    );
  }
  if (!displayContent.trim()) return null;
  return (
    <div className="studio-md w-full min-w-0 max-w-full">
      <Markdown components={assistantMarkdownComponents}>{displayContent}</Markdown>
    </div>
  );
});

function humanFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function SmileChatGeneral() {
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamOutputStarted, setStreamOutputStarted] = useState(false);
  const streamTextRef = useRef<StreamingTextHandle>(null);
  const [translatingSpeech, setTranslatingSpeech] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const chatLoadGenRef = useRef(0);
  /** Bucket currently allowed on screen / for writes — must match live session. */
  const conversationOwnerRef = useRef<string>(ANONYMOUS_STORAGE_USER);
  /** After a signed-out boot/sign-out wipe, don't re-clobber in-session guest drafts. */
  const signedOutBootDoneRef = useRef(false);
  const [models, setModels] = useState<ChatModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [routedModelHint, setRoutedModelHint] = useState<string | null>(null);
  const [buildSidebarOpen, setBuildSidebarOpen] = useState(false);
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(() => defaultLayoutPrefs());
  const layoutPrefsRef = useRef(layoutPrefs);
  layoutPrefsRef.current = layoutPrefs;
  const [activeAgent, setActiveAgent] = useState<{
    id: string;
    name: string;
    description?: string;
  } | null>(null);
  const [buildPanelTab, setBuildPanelTab] = useState<BuildPanelTab>("preview");
  const [selectedBuildFilePath, setSelectedBuildFilePath] = useState<string | null>(null);
  const [selectedCanvasSectionId, setSelectedCanvasSectionId] = useState<string | null>(null);
  const [latestBuildArtifact, setLatestBuildArtifact] = useState<BuildArtifact | null>(null);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [attachingFiles, setAttachingFiles] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);
  const [session, setSession] = useState<SmileSession | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [pendingDeviceOps, setPendingDeviceOps] = useState<DeviceOpsPayload | null>(null);
  const [deviceOpsOpen, setDeviceOpsOpen] = useState(false);
  const [deviceOpsApplying, setDeviceOpsApplying] = useState(false);
  const [deviceOpsResult, setDeviceOpsResult] = useState<string | null>(null);
  const [deviceCanWrite, setDeviceCanWrite] = useState(false);
  const [deviceOpsRootName, setDeviceOpsRootName] = useState("Folder");

  const clientLocationRef = useRef<UserLocationHint | null>(null);
  const serverSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptifyAbortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const latestTranscriptRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sendInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const [composerInset, setComposerInset] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [compactPhoneComposer, setCompactPhoneComposer] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialCorner, setTutorialCorner] = useState(() => readQuickTutorialDone());
  const [customThemeOn, setCustomThemeOn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompactPhoneComposer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (readQuickTutorialDone()) setTutorialCorner(true);
  }, []);

  const markTutorialDone = useCallback(() => {
    setTutorialCorner(true);
    persistQuickTutorialDone();
  }, []);

  useEffect(() => {
    if (!session?.userId) return;
    let cancelled = false;
    void hydrateQuickTutorialDoneFromServer().then((done) => {
      if (!cancelled && done) setTutorialCorner(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  useEffect(() => {
    setCustomThemeOn(readTheme().enabled);
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<ThemePrefs>).detail;
      if (detail) setCustomThemeOn(Boolean(detail.enabled));
      else setCustomThemeOn(readTheme().enabled);
    };
    window.addEventListener("smile-theme-changed", onTheme);
    return () => window.removeEventListener("smile-theme-changed", onTheme);
  }, []);

  useEffect(() => {
    const loadActiveAgent = async () => {
      if (!readSession()?.userId) {
        setActiveAgent(null);
        return;
      }
      try {
        const res = await fetch("/api/agents", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          agents?: Array<{ id: string; name: string; description?: string; enabled?: boolean }>;
          activeAgentId?: string | null;
        };
        const id = data.activeAgentId;
        const agent = id ? data.agents?.find((a) => a.id === id && a.enabled !== false) : null;
        setActiveAgent(agent ? { id: agent.id, name: agent.name, description: agent.description } : null);
      } catch {
        /* ignore */
      }
    };
    void loadActiveAgent();
    const onAgent = (e: Event) => {
      const detail = (e as CustomEvent<ActiveAgentChangeDetail>).detail;
      if (!detail) {
        void loadActiveAgent();
        return;
      }
      if (!detail.activeAgentId) {
        setActiveAgent(null);
        return;
      }
      if (detail.agent) {
        setActiveAgent({
          id: detail.agent.id,
          name: detail.agent.name,
          description: detail.agent.description,
        });
        return;
      }
      void loadActiveAgent();
    };
    const onAuth = () => void loadActiveAgent();
    window.addEventListener(ACTIVE_AGENT_CHANGE_EVENT, onAgent);
    window.addEventListener("smile-auth-changed", onAuth);
    return () => {
      window.removeEventListener(ACTIVE_AGENT_CHANGE_EVENT, onAgent);
      window.removeEventListener("smile-auth-changed", onAuth);
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const resolveCanvasOpen = useCallback((hasArtifact: boolean) => {
    const p = layoutPrefsRef.current;
    if (p.rememberCanvasOpen) return p.canvasOpenPreferred;
    return hasArtifact;
  }, []);

  const setCanvasOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setBuildSidebarOpen((prev) => {
      const next = typeof open === "function" ? open(prev) : open;
      const p = layoutPrefsRef.current;
      if (p.rememberCanvasOpen && p.canvasOpenPreferred !== next) {
        const saved = persistLayout({ ...p, canvasOpenPreferred: next });
        setLayoutPrefs(saved);
        syncLayoutToServer(saved);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (buildSidebarOpen) setMobileSidebarOpen(false);
  }, [buildSidebarOpen]);

  useEffect(() => {
    const p = readLayout();
    applyLayoutCssVars(p);
    setLayoutPrefs(p);
    if (p.rememberCanvasOpen) setBuildSidebarOpen(p.canvasOpenPreferred);
    const onLayout = (e: Event) => {
      const detail = (e as CustomEvent<LayoutPrefs>).detail;
      if (detail) {
        setLayoutPrefs(detail);
        applyLayoutCssVars(detail);
      }
    };
    window.addEventListener(LAYOUT_CHANGE_EVENT, onLayout);
    return () => window.removeEventListener(LAYOUT_CHANGE_EVENT, onLayout);
  }, []);

  useEffect(() => {
    const userId = session?.userId;
    if (!userId) return;
    let cancelled = false;
    void fetch("/api/user/preferences", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { preferences?: { layout?: LayoutPrefs } };
        if (!data.preferences?.layout || cancelled) return;
        const saved = persistLayout(normalizeLayoutPrefs(data.preferences.layout));
        setLayoutPrefs(saved);
        if (saved.rememberCanvasOpen) setBuildSidebarOpen(saved.canvasOpenPreferred);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  const columnOrders = useMemo(() => layoutColumnOrders(layoutPrefs), [layoutPrefs]);
  const dockInsets = useMemo(
    () => composerDockInsets(layoutPrefs, { canvasOpen: buildSidebarOpen }),
    [layoutPrefs, buildSidebarOpen],
  );

  const onResizeCanvasWidth = useCallback((widthPx: number) => {
    const clamped = Math.min(MAX_CANVAS_WIDTH_PX, Math.max(MIN_CANVAS_WIDTH_PX, Math.round(widthPx)));
    const saved = persistLayout({ ...layoutPrefsRef.current, canvasWidthPx: clamped });
    setLayoutPrefs(saved);
    syncLayoutToServer(saved);
  }, []);

  const onResizeSidebarWidth = useCallback((widthPx: number) => {
    const clamped = Math.min(MAX_SIDEBAR_WIDTH_PX, Math.max(MIN_SIDEBAR_WIDTH_PX, Math.round(widthPx)));
    const saved = persistLayout({ ...layoutPrefsRef.current, sidebarWidthPx: clamped });
    setLayoutPrefs(saved);
    syncLayoutToServer(saved);
  }, []);

  const applyConversationList = useCallback((list: SavedConversation[], storageUser: string) => {
    // Hard gate: never paint another identity's chats into the UI.
    const session = readSession();
    const liveOwner = conversationStorageUserId(session?.userId);
    if (storageUser !== liveOwner) return;
    // Account bucket requires a live userId; guest bucket requires signed-out.
    if (storageUser !== ANONYMOUS_STORAGE_USER && !session?.userId) return;
    if (storageUser === ANONYMOUS_STORAGE_USER && session?.userId) return;
    conversationOwnerRef.current = storageUser;
    setConversations(list);
    const last = loadLastActiveId("assistant", storageUser);
    if (last && list.some((c) => c.id === last)) {
      const c = list.find((x) => x.id === last)!;
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(last);
      setMessages(sanitizeAssistantMessages(c.messages));
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(resolveCanvasOpen(Boolean(fallbackArtifact)));
    } else if (list.length > 0) {
      const c = list[0];
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(c.id);
      setMessages(sanitizeAssistantMessages(c.messages));
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(resolveCanvasOpen(Boolean(fallbackArtifact)));
      saveLastActiveId(c.id, "assistant", storageUser);
    } else {
      setActiveId(null);
      setMessages([]);
      setLatestBuildArtifact(null);
      setBuildSidebarOpen(resolveCanvasOpen(false));
    }
  }, [resolveCanvasOpen]);

  const resetToEmptyChat = useCallback(() => {
    setConversations([]);
    setActiveId(null);
    setMessages([]);
    setLatestBuildArtifact(null);
    setBuildSidebarOpen(resolveCanvasOpen(false));
  }, [resolveCanvasOpen]);

  const showSignedOutEmpty = useCallback(() => {
    conversationOwnerRef.current = ANONYMOUS_STORAGE_USER;
    // Purge guest bucket so leaked account copies cannot resurface.
    clearConversations("assistant", ANONYMOUS_STORAGE_USER);
    resetToEmptyChat();
    applyConversationList([], ANONYMOUS_STORAGE_USER);
    signedOutBootDoneRef.current = true;
  }, [applyConversationList, resetToEmptyChat]);

  const loadAccountChats = useCallback(
    async (_requestedUserId?: string | null) => {
      const gen = ++chatLoadGenRef.current;

      // Cookie is the only authority for whose chats may be shown.
      const verifiedUserId = await readVerifiedServerUserId();
      if (gen !== chatLoadGenRef.current) return;

      if (verifiedUserId) {
        signedOutBootDoneRef.current = false;
        if (readSession()?.userId !== verifiedUserId) {
          await hydrateServerSession();
          if (gen !== chatLoadGenRef.current) return;
          setSession(readSession());
        }

        const userId = verifiedUserId;
        const storageUser = conversationStorageUserId(userId);

        if (conversationOwnerRef.current !== storageUser) {
          conversationOwnerRef.current = storageUser;
          resetToEmptyChat();
        }

        migrateAnonymousConversationsToUser(userId, "assistant");
        const local = loadConversations("assistant", storageUser);
        const serverResult = await fetchServerConversations();
        if (gen !== chatLoadGenRef.current) return;
        // Session must still be this verified user — never paint another bucket.
        if (readSession()?.userId !== userId) return;

        if (serverResult.status === "unauthorized") {
          clearSession();
          setSession(null);
          if (gen !== chatLoadGenRef.current) return;
          showSignedOutEmpty();
          return;
        }

        const server = serverResult.status === "ok" ? serverResult.conversations : [];
        const merged =
          serverResult.status === "ok" ? mergeConversations(local, server) : local;
        persistConversations(merged, "assistant", storageUser);
        applyConversationList(merged, storageUser);
        if (serverResult.status === "ok" && merged.length > 0) {
          void saveServerConversations(merged).then((r) => {
            if (!r.ok && r.status === 401) {
              clearSession();
              setSession(null);
              setError("Sign in again to sync chats to your account.");
            }
          });
        }
        void syncConnectedServicesFromServer(userId);
        return;
      }

      // No cookie → signed out. Never restore any stored chat history.
      if (readSession()?.userId) {
        clearSession();
        setSession(null);
      }
      if (gen !== chatLoadGenRef.current) return;
      const leavingAccount = conversationOwnerRef.current !== ANONYMOUS_STORAGE_USER;
      if (leavingAccount || !signedOutBootDoneRef.current) {
        showSignedOutEmpty();
      }
    },
    [applyConversationList, resetToEmptyChat, showSignedOutEmpty],
  );

  useEffect(() => {
    void detectBrowserLocation().then((loc) => {
      clientLocationRef.current = loc;
    });
  }, []);

  useEffect(() => {
    const onAuth = () => {
      if (!authReady) return;
      const next = readSession();
      setSession(next);
      void fetchUsageSummary().then(setUsage);
      void loadAccountChats(next?.userId);
    };
    window.addEventListener("smile-auth-changed", onAuth);
    return () => window.removeEventListener("smile-auth-changed", onAuth);
  }, [authReady, loadAccountChats]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromSso = params.has("signed_in");
    void hydrateServerSession()
      .then(async (ok) => {
        const next = readSession();
        setSession(next);
        setAuthReady(true);
        void fetchUsageSummary().then(setUsage);
        await loadAccountChats(next?.userId);
        setHydrated(true);
        if (fromSso) {
          params.delete("signed_in");
          const qs = params.toString();
          const path = window.location.pathname + (qs ? `?${qs}` : "");
          window.history.replaceState(null, "", path);
          if (!ok && !readSession()) {
            window.location.href = "/sign-in?error=session_sync";
          }
        }
      })
      .catch(() => {
        clearSession();
        setSession(null);
        setAuthReady(true);
        void loadAccountChats(null).finally(() => setHydrated(true));
      });
  }, [loadAccountChats]);

  useEffect(() => {
    if (!authReady) return;
    void loadAccountChats(session?.userId);
  }, [authReady, session?.userId, loadAccountChats]);

  useEffect(() => {
    void fetch("/api/chat/models", { credentials: "include" })
      .then((r) => r.json())
      .then((data: {
        models?: ChatModelInfo[];
        defaultModel?: string | null;
      }) => {
        const next = Array.isArray(data.models) ? data.models : [];
        setModels(next);
        const available = next.filter((m) => m.available);
        const auto = next.find((m) => m.id === "auto") ?? available.find((m) => m.id === "auto");
        const claude = available.find((m) => m.id === DEFAULT_CHAT_MODEL_ID);
        const def = data.defaultModel;
        const defOk = def && next.some((m) => m.id === def);
        // Prefer Auto → Claude Sonnet; never surface API-key setup copy in the UI.
        setSelectedModel(defOk ? def! : auto?.id ?? claude?.id ?? available[0]?.id ?? "auto");
        setError((prev) =>
          prev && /ANTHROPIC|API_KEY|redeploy|Vercel/i.test(prev) ? null : prev,
        );
      })
      .catch(() => {
        // Keep Auto as the default label; don't block the landing with setup errors.
        setSelectedModel((prev) => prev || "auto");
      });
  }, []);

  const availableModels = useMemo(() => {
    const ready = models.filter((m) => m.available);
    if (ready.length > 0) return ready;
    // Always expose Auto in the UI — it routes to Claude Sonnet 4.5 under the hood.
    const auto = models.find((m) => m.id === "auto");
    if (auto) return [{ ...auto, available: true, label: "Auto" }];
    return [{ id: "auto", label: "Auto", provider: "auto", available: true }];
  }, [models]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (availableModels.some((m) => m.id === selectedModel)) return;
    const auto = availableModels.find((m) => m.id === "auto");
    const claude = availableModels.find((m) => m.id === DEFAULT_CHAT_MODEL_ID);
    setSelectedModel(auto?.id ?? claude?.id ?? availableModels[0].id);
  }, [availableModels, selectedModel]);

  useEffect(() => {
    if (!hydrated || !activeId || messages.length === 0) return;
    const liveOwner = liveConversationStorageUser(readSession);
    // Never write chat content into another identity's bucket (e.g. sign-out mid-stream).
    if (liveOwner !== conversationOwnerRef.current) return;
    const storageUser = liveOwner;
    setConversations((prev) => {
      if (conversationOwnerRef.current !== storageUser) return prev;
      const merged = upsertConversation(prev, {
        id: activeId,
        messages,
        title: deriveTitle(messages),
        updatedAt: Date.now(),
        buildArtifact: latestBuildArtifact,
      });
      persistConversations(merged, "assistant", storageUser);
      const liveUserId = readSession()?.userId;
      if (liveUserId && conversationStorageUserId(liveUserId) === storageUser) {
        if (serverSyncRef.current) clearTimeout(serverSyncRef.current);
        serverSyncRef.current = setTimeout(() => {
          if (readSession()?.userId !== liveUserId) return;
          if (conversationOwnerRef.current !== storageUser) return;
          void saveServerConversations(merged).then((r) => {
            if (!r.ok && r.status === 401) {
              clearSession();
              setSession(null);
              setError("Sign in again to sync chats to your account.");
            }
          });
        }, 800);
      }
      return merged;
    });
    saveLastActiveId(activeId, "assistant", storageUser);
  }, [messages, activeId, hydrated, latestBuildArtifact, session?.userId]);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    promptifyAbortRef.current?.abort();
    promptifyAbortRef.current = null;
    setPending(false);
    setTranslatingSpeech(false);
    streamTextRef.current?.reset();
    setStreamOutputStarted(false);
    setStreamingMessageId(null);
  }, []);

  const newChat = useCallback(() => {
    stopAll();
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLatestBuildArtifact(null);
    setSelectedCanvasSectionId(null);
    setCanvasOpen(false);
    setAttachments([]);
    saveLastActiveId(null, "assistant", liveConversationStorageUser(readSession));
    setMobileSidebarOpen(false);
  }, [stopAll, setCanvasOpen]);

  useEffect(() => {
    const onHome = () => newChat();
    window.addEventListener("smile-go-home", onHome);
    return () => window.removeEventListener("smile-go-home", onHome);
  }, [newChat]);

  const selectConversation = useCallback(
    (c: SavedConversation) => {
      // Only open chats that are in the currently authorized list.
      if (!conversations.some((x) => x.id === c.id)) return;
      stopAll();
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(c.id);
      setMessages(sanitizeAssistantMessages(c.messages));
      setInput("");
      setError(null);
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(resolveCanvasOpen(Boolean(fallbackArtifact)));
      setAttachments([]);
      const storageUser = liveConversationStorageUser(readSession);
      if (storageUser !== conversationOwnerRef.current) return;
      saveLastActiveId(c.id, "assistant", storageUser);
      setMobileSidebarOpen(false);
    },
    [stopAll, conversations, resolveCanvasOpen],
  );

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const id = u.searchParams.get("conversation");
    if (!id) return;
    const c = conversations.find((x) => x.id === id);
    if (c) selectConversation(c);
    u.searchParams.delete("conversation");
    window.history.replaceState({}, "", `${u.pathname}${u.search}`);
  }, [hydrated, conversations, selectConversation]);

  const deleteConversation = useCallback(
    (ev: MouseEvent<HTMLButtonElement>, convId: string) => {
      ev.stopPropagation();
      const liveOwner = liveConversationStorageUser(readSession);
      if (liveOwner !== conversationOwnerRef.current) return;
      const next = removeConversation(conversations, convId);
      setConversations(next);
      persistConversations(next, "assistant", liveOwner);
      const liveUserId = readSession()?.userId;
      if (liveUserId && conversationStorageUserId(liveUserId) === liveOwner) {
        void saveServerConversations(next).then((r) => {
          if (!r.ok && r.status === 401) {
            clearSession();
            setSession(null);
          }
        });
      }
      if (activeId === convId) {
        if (next.length > 0) selectConversation(next[0]);
        else {
          setLatestBuildArtifact(null);
          setCanvasOpen(false);
          newChat();
        }
      }
    },
    [conversations, activeId, selectConversation, newChat, setCanvasOpen],
  );

  const streamPromptify = useCallback(async (raw: string) => {
    if (!raw) return;
    const controller = new AbortController();
    promptifyAbortRef.current = controller;
    const reqTid = window.setTimeout(() => controller.abort(), 120_000);
    setTranslatingSpeech(true);
    setInput("");
    setError(null);
    try {
      const res = await fetch("/api/promptify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Promptify failed (${res.status})`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setInput(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setInput(raw);
    } finally {
      clearTimeout(reqTid);
      setTranslatingSpeech(false);
      promptifyAbortRef.current = null;
    }
  }, []);

  const removeAttachment = useCallback((idToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== idToRemove));
  }, []);

  const addFilesFromList = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      if (remaining <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files per prompt.`);
        return;
      }

      const picked = files.slice(0, remaining);
      const next: PromptAttachment[] = [];
      setAttachingFiles(true);

      try {
        for (const file of picked) {
          try {
            const processed = await processFileForChatAttachment(file);
            next.push({
              id: id(),
              ...processed,
            });
          } catch (e) {
            const detail = e instanceof Error ? e.message : "Unknown error";
            setError(`Could not attach "${file.name}": ${detail}`);
          }
        }

        if (next.length > 0) {
          setAttachments((prev) => [...prev, ...next]);
          setError(null);
        }
      } finally {
        setAttachingFiles(false);
      }
    },
    [attachments.length],
  );

  const onPickFiles = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(ev.target.files ?? []);
      ev.target.value = "";
      await addFilesFromList(files);
    },
    [addFilesFromList],
  );

  const onComposerDragEnter = useCallback((ev: DragEvent) => {
    ev.preventDefault();
    dragDepthRef.current += 1;
    if (filesFromDataTransfer(ev.dataTransfer).length > 0 || ev.dataTransfer?.types.includes("Files")) {
      setIsDraggingFiles(true);
    }
  }, []);

  const onComposerDragOver = useCallback((ev: DragEvent) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  }, []);

  const onComposerDragLeave = useCallback((ev: DragEvent) => {
    ev.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }, []);

  const onComposerDrop = useCallback(
    async (ev: DragEvent) => {
      ev.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      if (pending || translatingSpeech || attachingFiles) return;

      const files = filesFromDataTransfer(ev.dataTransfer);
      if (files.length > 0) {
        await addFilesFromList(files);
        return;
      }

      const pathHint = droppedPathHint(ev.dataTransfer);
      if (pathHint) {
        setError(
          "That drop was a file path, not the file itself. Drag the file from Finder/Files onto the prompt box, or use Attach.",
        );
      }
    },
    [addFilesFromList, pending, translatingSpeech, attachingFiles],
  );

  const followStreamScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const nearBottom = scrollTop + clientHeight >= scrollHeight - 96;
    if (nearBottom) {
      el.scrollTop = scrollHeight;
    }
  }, []);

  const markStreamOutputStarted = useCallback(() => {
    setStreamOutputStarted(true);
  }, []);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending || translatingSpeech || sendInFlightRef.current) return;

    if (!session?.userId && usage?.signupRequired) {
      setError(
        `You have used $${ANONYMOUS_SPEND_LIMIT_USD.toFixed(2)} in trial AI usage. Create a free account to continue.`,
      );
      return;
    }

    const modelMeta = availableModels.find((m) => m.id === selectedModel);
    if (!modelMeta?.available) {
      setError("Chat is temporarily unavailable. Try again in a moment.");
      return;
    }

    sendInFlightRef.current = true;

    let convId = activeId;
    if (!convId) {
      convId = id();
      setActiveId(convId);
    }

    const attachmentsForRequest = attachments;
    const userMsg: ChatMessage = { id: id(), role: "user", content: trimmed };
    const assistantId = id();
    const assistantPlaceholder: ChatMessage = { id: assistantId, role: "assistant", content: "" };
    const nextMessages: ChatMessage[] = [...messagesRef.current, userMsg, assistantPlaceholder];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setError(null);
    setPending(true);
    flushSync(() => {
      setStreamingMessageId(assistantId);
      setStreamOutputStarted(false);
    });
    const isBuildRequest = promptRequestsBuildWorkspace(trimmed);
    if (isBuildRequest) {
      setCanvasOpen(true);
      setBuildPanelTab("preview");
    }

    const applyBuildArtifact = (snapshot: string, allowOpen = false) => {
      const artifact =
        extractBuildArtifact(snapshot) ??
        (allowOpen ? extractBuildArtifact(snapshot, { allowOpenFence: true }) : null);
      if (!artifact) return;
      setLatestBuildArtifact(artifact);
      setSelectedBuildFilePath(artifact.primaryPath ?? artifact.files?.[0]?.path ?? null);
      setCanvasOpen(true);
      setBuildPanelTab("preview");
    };

    const controller = new AbortController();
    abortRef.current = controller;
    const reqTid = window.setTimeout(() => controller.abort(), 180_000);
    const history = nextMessages
      .filter((m) => m.id !== assistantId)
      .map(({ role, content }) => ({ role, content }));

    const connected = readConnectedServices(session?.userId);
    const deviceManifest =
      session?.userId && connected.services.deviceFiles.connected
        ? await buildDeviceManifestForChat(session.userId)
        : null;

    let mcpConfig: unknown;
    try {
      const raw = localStorage.getItem("fighur-mcp-config");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          mcpServers?: Record<string, unknown>;
        };
        let disabled = new Set<string>();
        try {
          const d = localStorage.getItem("fighur-mcp-disabled");
          if (d) {
            const arr = JSON.parse(d) as unknown;
            disabled = new Set(
              Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [],
            );
          }
        } catch {
          /* ignore */
        }
        if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
          const mcpServers: Record<string, unknown> = {};
          for (const [id, cfg] of Object.entries(parsed.mcpServers)) {
            if (!disabled.has(id)) mcpServers[id] = cfg;
          }
          mcpConfig = { mcpServers };
        } else {
          mcpConfig = parsed;
        }
      }
    } catch {
      mcpConfig = undefined;
    }

    const chatPayload = JSON.stringify({
      messages: history,
      model: selectedModel,
      attachments: attachmentsForRequest,
      connectedServices: toConnectedServicesPayload(connected),
      deviceManifest: deviceManifest ?? undefined,
      clientLocation: clientLocationRef.current ?? undefined,
      canvasContext: buildClientCanvasContext(
        latestBuildArtifact,
        selectedBuildFilePath,
        selectedCanvasSectionId,
      ),
      mcpConfig: mcpConfig ?? undefined,
      agentId: activeAgent?.id ?? undefined,
      userSession: session
        ? {
            email: session.email,
            name: session.name,
            ...(session.userId ? { userId: session.userId } : {}),
          }
        : undefined,
    });

    const postChat = () =>
      fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: chatPayload,
        signal: controller.signal,
      });

    let fullText = "";

    try {
      let res: Response;
      try {
        res = await postChat();
      } catch (first) {
        if (controller.signal.aborted || !isRetryableChatError(first)) throw first;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        res = await postChat();
      }
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          error?: string;
          signupRequired?: boolean;
        };
        void fetchUsageSummary().then(setUsage);
        if (res.status === 402 && errJson.signupRequired) {
          setError(errJson.error || `Create an account to continue after $${ANONYMOUS_SPEND_LIMIT_USD} of trial usage.`);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          return;
        }
        throw new Error(errJson.error || `Request failed (${res.status})`);
      }

      const routedId = res.headers.get("X-FigHur-Model");
      if (selectedModel === "auto" && routedId) {
        const raw =
          models.find((m) => m.id === routedId)?.label ?? routedId.replace(/^[^:]+:/, "");
        // Short, readable label for the Auto pill (avoid truncation of long model ids).
        const short = raw
          .replace(/^anthropic:/i, "")
          .replace(/^claude\s+/i, "")
          .replace(/(\d{4})-\d{2}-\d{2}.*$/i, "")
          .trim();
        setRoutedModelHint(short || "Sonnet 4.5");
      } else {
        setRoutedModelHint(null);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let lastArtifactCheck = 0;
      let streamFinished = false;

      // Streaming UI already armed before fetch — reset buffer for this response.
      streamTextRef.current?.reset();
      setStreamOutputStarted(false);

      const checkArtifacts = (snapshot: string) => {
        if (!snapshot.includes("```") && !snapshot.includes("data:image") && !snapshot.includes("![")) {
          return;
        }
        const now = performance.now();
        const throttleMs = isBuildRequest ? 120 : 400;
        if (now - lastArtifactCheck < throttleMs) return;
        lastArtifactCheck = now;
        applyBuildArtifact(snapshot, true);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          fullText += chunk;
          streamTextRef.current?.push(chunk);
          followStreamScroll();
          checkArtifacts(fullText);
        }
        const tail = decoder.decode();
        if (tail) {
          fullText += tail;
          streamTextRef.current?.push(tail);
          followStreamScroll();
          checkArtifacts(fullText);
        }
        streamFinished = true;
      } finally {
        /* DOM stream surface only — React state updates once when complete */
      }

      if (streamFinished) {
        applyBuildArtifact(fullText, true);
        const finalContent = finalizeAssistantContent(fullText);
        flushSync(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: finalContent } : m)),
          );
          setStreamingMessageId(null);
        });
        streamTextRef.current?.reset();
        setStreamOutputStarted(false);
        followStreamScroll();
        void fetchUsageSummary().then(setUsage);
        // Agent tools may have switched the active agent mid-turn.
        if (session?.userId) {
          void fetch("/api/agents", { cache: "no-store" })
            .then(async (r) => {
              if (!r.ok) return;
              const data = (await r.json()) as {
                agents?: Array<{ id: string; name: string; description?: string; enabled?: boolean }>;
                activeAgentId?: string | null;
              };
              const id = data.activeAgentId;
              const agent = id
                ? data.agents?.find((a) => a.id === id && a.enabled !== false)
                : null;
              setActiveAgent(
                agent ? { id: agent.id, name: agent.name, description: agent.description } : null,
              );
            })
            .catch(() => {
              /* ignore */
            });
        }

        if (connected.services.deviceFiles.connected && session?.userId) {
          const opsPayload = parseDeviceOpsFromText(fullText);
          if (opsPayload && opsPayload.ops.length > 0) {
            setPendingDeviceOps(opsPayload);
            setDeviceOpsResult(null);
            void buildDeviceManifestForChat(session.userId).then((m) => {
              if (m?.rootName) setDeviceOpsRootName(m.rootName);
            });
            void loadDeviceDirectoryHandle(session.userId).then((h) => {
              setDeviceCanWrite(Boolean(h));
            });
            setDeviceOpsOpen(true);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const message = friendlyChatError(e);
        setError(message);
        const partial = fullText.trim() ? finalizeAssistantContent(fullText) : "";
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            if (partial.trim()) return { ...m, content: partial };
            return { ...m, content: `_Error: ${message}_` };
          }),
        );
      }
      streamTextRef.current?.reset();
    } finally {
      clearTimeout(reqTid);
      setPending(false);
      setStreamOutputStarted(false);
      setStreamingMessageId(null);
      abortRef.current = null;
      sendInFlightRef.current = false;
    }
  }, [
    input,
    pending,
    translatingSpeech,
    activeId,
    selectedModel,
    attachments,
    session,
    availableModels,
    latestBuildArtifact,
    selectedBuildFilePath,
    selectedCanvasSectionId,
    followStreamScroll,
    markStreamOutputStarted,
    setCanvasOpen,
    activeAgent?.id,
  ]);

  const toggleListen = useCallback(() => {
    if (listening && speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
      setListening(false);
      return;
    }
    stopAll();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Dictation is not supported in this browser.");
      return;
    }
    const rec = new SR();
    speechRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    latestTranscriptRef.current = "";
    setListening(true);
    setError(null);
    rec.onresult = (ev: { results: SpeechRecognitionResultList }) => {
      let full = "";
      for (let i = 0; i < ev.results.length; i++) full += ev.results.item(i).item(0).transcript;
      latestTranscriptRef.current = full;
      setInput(full);
    };
    rec.onend = () => {
      setListening(false);
      speechRef.current = null;
      const raw = latestTranscriptRef.current.trim();
      latestTranscriptRef.current = "";
      if (raw) void streamPromptify(raw);
    };
    rec.start();
  }, [listening, stopAll, streamPromptify]);

  const showEmpty = messages.length === 0;
  const showTutorialCorner = tutorialCorner || !showEmpty;

  useEffect(() => {
    if (!showEmpty) markTutorialDone();
  }, [showEmpty, markTutorialDone]);
  const busy = pending || translatingSpeech;
  const showStreamWaitingDots = Boolean(pending && streamingMessageId && !streamOutputStarted);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const updateScrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const canScroll = scrollHeight > clientHeight + 12;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 56;
    setShowScrollToBottom(canScroll && !atBottom);
  }, []);

  useEffect(() => {
    if (showEmpty) {
      setComposerInset(0);
      setShowScrollToBottom(false);
      return;
    }
    const el = composerDockRef.current;
    if (!el) return;

    const measure = () => {
      const dock = composerDockRef.current;
      if (!dock) return;
      const height = dock.offsetHeight;
      const gap = window.matchMedia("(max-width: 767px)").matches ? 36 : 16;
      setComposerInset(height + gap);
    };

    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [
    showEmpty,
    error,
    session,
    attachments.length,
    pending,
    listening,
    translatingSpeech,
    messages.length,
    buildSidebarOpen,
    layoutPrefs,
    dockInsets.left,
    dockInsets.right,
  ]);

  useEffect(() => {
    if (showEmpty) return;
    const el = listRef.current;
    if (!el) return;

    updateScrollToBottom();
    el.addEventListener("scroll", updateScrollToBottom, { passive: true });
    const ro = new ResizeObserver(updateScrollToBottom);
    ro.observe(el);
    const thread = el.querySelector(".chat-thread");
    if (thread) ro.observe(thread);

    return () => {
      el.removeEventListener("scroll", updateScrollToBottom);
      ro.disconnect();
    };
  }, [showEmpty, messages, pending, streamOutputStarted, composerInset, updateScrollToBottom]);

  useEffect(() => {
    if (!showEmpty && streamOutputStarted) updateScrollToBottom();
  }, [showEmpty, streamOutputStarted, updateScrollToBottom]);
  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);
  const previewImageUrl = useMemo(
    () => resolveImagePreviewUrl(latestBuildArtifact),
    [latestBuildArtifact],
  );

  const handleEditCanvasSection = useCallback((section: CanvasSection) => {
    setSelectedCanvasSectionId(section.id);
    setCanvasOpen(true);
    setBuildPanelTab("preview");
    setInput(canvasEditPrefill(section));
    window.setTimeout(() => {
      document.getElementById("smile-chat-input")?.focus();
    }, 0);
  }, [setCanvasOpen]);

  const copyMessage = useCallback(async (messageId: string, content: string) => {
    const ok = await copyTextToClipboard(content);
    if (!ok) {
      setError("Could not copy to clipboard.");
      return;
    }
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 2000);
  }, []);

  const composerPanel = (
    <>
      <div
        className={`composer-float relative box-border w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-[var(--bg-elevated)]/95 p-1 backdrop-blur-xl sm:rounded-2xl ${
          isDraggingFiles
            ? "border-[var(--accent)]/50 ring-2 ring-[var(--accent)]/25"
            : "border-white/[0.14]"
        }`}
        onDragEnter={onComposerDragEnter}
        onDragOver={onComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={(ev) => void onComposerDrop(ev)}
      >
        {isDraggingFiles ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--accent)]/10 backdrop-blur-[1px] sm:rounded-2xl"
            aria-hidden
          >
            <p className="rounded-full border border-[var(--accent)]/35 bg-[var(--bg-deep)]/85 px-4 py-2 text-sm font-medium text-[var(--accent)]">
              Drop files to attach
            </p>
          </div>
        ) : null}
        <form
          className="box-border flex w-full min-w-0 max-w-full flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {translatingSpeech ? (
            <p className="px-3 py-2 text-xs text-[var(--accent)]">Refining your speech into clean text…</p>
          ) : null}
          {attachingFiles ? (
            <p className="px-3 py-2 text-xs text-[var(--accent)]">Processing attachment…</p>
          ) : null}
          {activeAgent ? (
            <div className="flex items-center gap-2 px-3 pt-2">
              <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-0.5 text-[0.65rem] font-semibold text-[var(--accent)]">
                Talking to {activeAgent.name}
              </span>
              {activeAgent.description ? (
                <span className="truncate text-[0.65rem] text-[var(--text-faint)]">
                  {activeAgent.description}
                </span>
              ) : null}
            </div>
          ) : null}
          <textarea
            id="smile-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length === 0) return;
              e.preventDefault();
              void addFilesFromList(files);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={PROMPT_PLACEHOLDER}
            rows={compactPhoneComposer ? (showEmpty ? 2 : 1) : showEmpty ? 3 : 2}
            className="box-border w-full max-w-full resize-none break-words bg-transparent px-3 py-2.5 text-base leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none max-md:px-2.5 max-md:py-1.5 max-md:leading-snug"
            disabled={busy || attachingFiles}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onPickFiles}
            className="hidden"
            accept="image/*,video/*,.mp4,.mov,.webm,.mkv,.m4v,.pdf,.txt,.md,.csv,.json"
          />
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-2 py-2">
              {attachments.map((a) => {
                const preview =
                  a.kind === "image" && a.content.startsWith("data:image")
                    ? a.content
                    : a.kind === "video"
                      ? videoPreviewDataUrl(a.content)
                      : null;
                return (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-[0.7rem] text-[var(--text-muted)]"
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt=""
                      className="h-8 w-8 rounded-md object-cover ring-1 ring-white/10"
                    />
                  ) : null}
                  {a.kind === "video" ? "Video: " : null}
                  {a.name} ({humanFileSize(a.size)})
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="text-[var(--text-faint)] hover:text-red-300"
                    aria-label={`Remove ${a.name}`}
                  >
                    ×
                  </button>
                </span>
                );
              })}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-row flex-wrap items-center justify-between gap-1.5 border-t border-white/[0.06] px-2 py-2 max-md:gap-1 max-md:px-1.5 max-md:py-1 sm:gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1 max-md:gap-0.5 sm:gap-1.5">
              <button
                type="button"
                onClick={toggleListen}
                disabled={busy}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06] max-md:px-2 max-md:py-1"
              >
                {listening ? "Stop" : "Speak"}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || attachingFiles}
                className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-40 max-md:px-2 max-md:py-1"
              >
                Attach
              </button>
              {!showEmpty ? (
                <button
                  type="button"
                  onClick={() => setCanvasOpen((v) => !v)}
                  className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/40 max-md:hidden"
                >
                  <span className="sm:hidden">Space</span>
                  <span className="hidden sm:inline">Workspace</span>
                </button>
              ) : null}
            </div>
            <div className="flex min-w-0 max-w-full flex-1 items-center justify-end gap-1.5 max-md:min-w-[9.5rem] max-md:gap-1 sm:w-auto sm:flex-none sm:flex-wrap">
              {availableModels.length === 1 ? (
                <span
                  className="min-w-0 max-w-[min(100%,14rem)] rounded-full bg-[var(--accent)] px-3 py-1.5 text-left text-xs font-semibold leading-snug text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] max-md:max-w-[11rem] max-md:px-2.5 max-md:py-1 sm:max-w-[16rem] sm:px-4 sm:py-2"
                  title={
                    routedModelHint
                      ? `Auto → Claude ${routedModelHint}`
                      : "Auto uses Claude Sonnet 4.5"
                  }
                >
                  {routedModelHint && selectedModel === "auto" ? (
                    <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1">
                      <span className="shrink-0">Auto</span>
                      <span className="truncate font-medium opacity-90">
                        <span className="hidden sm:inline">· </span>
                        {routedModelHint}
                      </span>
                    </span>
                  ) : (
                    availableModels[0].label
                  )}
                </span>
              ) : (
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setRoutedModelHint(null);
                  }}
                  disabled={busy || availableModels.length === 0}
                  className="min-w-0 max-w-[11rem] truncate appearance-none rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] outline-none transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 max-md:max-w-[7.5rem] max-md:px-2.5 max-md:py-1 sm:max-w-[13rem] sm:px-4 sm:py-2"
                  aria-label="Select model"
                  title={routedModelHint ?? undefined}
                >
                  {availableModels.length === 0 ? (
                    <option value="">No models</option>
                  ) : (
                    availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))
                  )}
                </select>
              )}
              <div className="flex shrink-0 items-center gap-1 max-md:gap-0.5 sm:gap-1.5">
                {latestBuildArtifact && !buildSidebarOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCanvasOpen(true);
                      setBuildPanelTab("preview");
                    }}
                    className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 max-md:px-2 max-md:py-1"
                  >
                    Canvas
                  </button>
                ) : null}
                {busy ? (
                  <button
                    type="button"
                    onClick={stopAll}
                    className="rounded-full px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06] max-md:px-2 max-md:py-1"
                  >
                    Stop
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="shrink-0 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] disabled:opacity-40 max-md:px-3 max-md:py-1 sm:px-4 sm:py-2"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      {error ? (
        <p className="mt-2 px-1 text-center text-xs text-red-300/90">{error}</p>
      ) : !showEmpty ? (
        <p className="mt-1 hidden px-1 text-center text-[0.65rem] leading-relaxed text-[var(--text-faint)] sm:block">
          Chats saved in this browser · Model picker enabled · Speech can refine your input
        </p>
      ) : null}
    </>
  );

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={newChat}
          className="w-full rounded-xl bg-[var(--accent)]/15 px-3 py-2.5 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25 transition hover:bg-[var(--accent)]/25"
        >
          + New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
        <p className="px-2 pb-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          Previous chats
        </p>
        {conversations.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-[var(--text-faint)]">
            Saved on this device. Start a message to create your first chat.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-start gap-1 rounded-xl transition ${
                    activeId === c.id
                      ? "bg-white/[0.08] ring-1 ring-white/[0.1]"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectConversation(c)}
                    className="min-w-0 flex-1 px-2.5 py-2 text-left"
                  >
                    <span className="line-clamp-2 text-xs font-medium text-[var(--text-primary)]">
                      {c.title || deriveTitle(c.messages)}
                    </span>
                    <span className="mt-0.5 block text-[0.65rem] text-[var(--text-faint)]">
                      {formatTime(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => deleteConversation(e, c.id)}
                    className="shrink-0 rounded-lg p-2 text-[var(--text-faint)] opacity-70 transition hover:bg-white/[0.08] hover:text-red-300 md:opacity-0 md:group-hover:opacity-100"
                    aria-label="Delete chat"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <p className="px-0.5 pb-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
          Account
        </p>
        {session ? (
          <div className="space-y-2">
            <p className="truncate text-xs text-[var(--text-primary)]" title={session.email}>
              {session.name ? `${session.name} · ` : null}
              {session.email}
            </p>
            {session.plan !== "pro" ? (
              <Link
                href="/upgrade"
                className="block py-0.5 text-center text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Upgrade to Pro
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void clearSessionAndServer().then(() => {
                  setSession(null);
                  showSignedOutEmpty();
                });
              }}
              className="w-full rounded-lg border border-white/[0.1] py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              href="/sign-in"
              className="rounded-lg bg-[var(--accent)]/15 py-2 text-center text-xs font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25 transition hover:bg-[var(--accent)]/25"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg border border-white/[0.1] py-2 text-center text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            >
              Create account
            </Link>
            <Link
              href="/upgrade"
              className="py-1 text-center text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-1 flex-col md:flex-row ${
        showEmpty
          ? "min-h-[calc(100dvh-3.25rem)]"
          : "h-full max-h-full min-h-0 overflow-hidden"
      }`}
    >
      {layoutPrefs.sidebarVisible ? (
        <aside
          className={`relative hidden h-full max-h-full min-h-0 shrink-0 flex-col overflow-hidden bg-[var(--bg-elevated)]/90 md:flex ${
            layoutPrefs.sidebarSide === "right" ? "border-l border-white/[0.06]" : "border-r border-white/[0.06]"
          }`}
          style={{
            width: "var(--chat-sidebar-w)",
            order: columnOrders.sidebar,
          }}
        >
          {sidebarContent}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            className={`absolute top-0 z-10 hidden h-full w-1.5 cursor-col-resize touch-none md:block ${
              layoutPrefs.sidebarSide === "right" ? "left-0" : "right-0"
            }`}
            onPointerDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = layoutPrefsRef.current.sidebarWidthPx;
              const side = layoutPrefsRef.current.sidebarSide;
              const onMove = (ev: PointerEvent) => {
                const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
                onResizeSidebarWidth(startW + delta);
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
          />
        </aside>
      ) : null}

      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-[90] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Chat list"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close chat list"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="absolute bottom-0 left-0 top-[3.25rem] flex min-h-0 w-[min(18rem,88vw)] flex-col overflow-hidden border-r border-white/[0.06] bg-[var(--bg-elevated)] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div
        className={`flex flex-1 flex-col ${
          showEmpty
            ? "min-h-[calc(100dvh-3.25rem)]"
            : "h-full max-h-full min-h-0 overflow-hidden"
        } ${buildSidebarOpen ? "max-md:hidden" : ""}`}
        style={{ order: columnOrders.main }}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
          >
            Chats
          </button>
          <button
            type="button"
            onClick={newChat}
            className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
          >
            New
          </button>
          {!showEmpty || showTutorialCorner ? (
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="ml-auto shrink-0 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)]"
            >
              Quick tutorial
            </button>
          ) : null}
        </div>

        {showTutorialCorner ? (
          <div className="hidden shrink-0 items-center justify-end border-b border-white/[0.06] px-4 py-2 sm:px-6 md:flex md:px-8">
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] transition hover:brightness-110"
            >
              Quick tutorial
            </button>
          </div>
        ) : null}

        <div
          className={`flex w-full min-w-0 flex-1 flex-col overflow-hidden px-4 pb-0 sm:px-6 md:px-8 ${showEmpty ? "min-h-0 flex-1 justify-center pt-0" : "relative min-h-0 pt-3 sm:pt-4 md:pt-6"}`}
        >
          {!session?.userId && usage?.signupRequired ? (
            <div
              className="mb-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-amber-100/95"
              role="alert"
            >
              <p className="font-semibold text-amber-50">Trial limit reached</p>
              <p className="mt-1">
                You have used ${usage.spentUsd.toFixed(2)} in AI tokens.{" "}
                <Link href="/sign-up" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
                  Create a free account
                </Link>{" "}
                for unlimited free chat with Claude in your private environment.
              </p>
            </div>
          ) : null}

          {showEmpty ? (
            <div className="home-empty-hero">
              <AmbientOmbreBackground active={!customThemeOn} />
              {!showTutorialCorner ? (
                <HomeLandingIntro
                  onStartTutorial={() => {
                    markTutorialDone();
                    setTutorialOpen(true);
                  }}
                />
              ) : null}
              <div className="composer-column mx-auto w-full max-w-2xl px-3 sm:px-4">{composerPanel}</div>
            </div>
          ) : (
            <div
              ref={listRef}
              className="chat-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-y-contain"
              style={{
                paddingBottom: composerInset > 0 ? composerInset : undefined,
                scrollPaddingBottom: composerInset > 0 ? composerInset : undefined,
              }}
            >
              <div className="chat-thread-gutter flex min-h-full flex-col justify-end">
                <div className="chat-thread flex w-full flex-col space-y-3">
              {messages.map((m) => {
                const isStreaming = pending && streamingMessageId === m.id;
                const isAssistant = m.role === "assistant";
                const canCopy =
                  isAssistant && copyableAssistantText(m.content).length > 0 && !isStreaming;
                const imageFallback =
                  isAssistant && m.id === lastAssistantMessageId ? previewImageUrl : null;
                return (
                  <div
                    key={m.id}
                    className={`group flex w-full min-w-0 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative min-w-0 rounded-2xl px-4 pt-2.5 pb-3 text-sm leading-relaxed sm:px-5 ${
                        m.role === "user"
                          ? "ml-auto w-fit max-w-[88%] bg-[var(--accent)]/12 text-[var(--text-primary)] ring-1 ring-[var(--accent)]/20"
                          : "chat-output-bubble w-fit max-w-[88%] bg-white/[0.03] text-[var(--text-muted)] ring-1 ring-white/[0.06] sm:max-w-[85%]"
                      }`}
                    >
                      {canCopy ? (
                        <button
                          type="button"
                          onClick={() => void copyMessage(m.id, copyableAssistantText(m.content))}
                          className={`absolute right-2 top-2 rounded-full border border-white/[0.1] bg-[var(--bg-deep)]/80 px-2 py-0.5 text-[0.65rem] font-medium text-[var(--text-muted)] backdrop-blur-sm transition hover:bg-white/[0.08] hover:text-[var(--text-primary)] sm:opacity-0 sm:group-hover:opacity-100 ${copiedMessageId === m.id ? "opacity-100 text-[var(--accent)]" : "opacity-100"}`}
                          aria-label={copiedMessageId === m.id ? "Copied" : "Copy reply"}
                        >
                          {copiedMessageId === m.id ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                      {isAssistant ? (
                        <div className={canCopy ? "pt-5" : undefined}>
                          <AssistantMessageBody
                            content={m.content}
                            isStreaming={isStreaming}
                            imageFallback={imageFallback}
                            streamTextRef={isStreaming ? streamTextRef : undefined}
                            onStreamUpdate={isStreaming ? followStreamScroll : undefined}
                            onStreamFirstOutput={isStreaming ? markStreamOutputStarted : undefined}
                          />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}
                </div>
              </div>
            </div>
          )}

          {!showEmpty && (showStreamWaitingDots || showScrollToBottom) ? (
            <div
              className="absolute left-1/2 z-30 -translate-x-1/2"
              style={{ bottom: composerInset > 0 ? composerInset + 10 : 160 }}
            >
              {showStreamWaitingDots ? (
                <StreamLoadingDots variant="fab" />
              ) : (
            <button
              type="button"
              onClick={() => scrollChatToBottom()}
              className="scroll-to-bottom-btn flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.14] bg-[var(--bg-elevated)]/95 text-[var(--accent)] shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[var(--accent)]/40 hover:bg-[var(--bg-elevated)] active:scale-95"
              aria-label="Scroll to latest messages"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </button>
              )}
            </div>
          ) : null}
        </div>

        {!showEmpty ? (
          <div
            ref={composerDockRef}
            className={`composer-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 max-md:!left-0 max-md:!right-0 ${
              buildSidebarOpen ? "max-md:hidden" : ""
            }`}
            style={{ left: dockInsets.left, right: dockInsets.right }}
          >
            <div className="composer-dock-inner composer-column pointer-events-auto mx-auto w-full min-w-0 max-w-2xl px-3 max-md:px-2 sm:px-4">
              <div className="mb-0.5 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--bg-deep)]/90 px-1.5 py-0.5 md:hidden">
                {session ? (
                  <>
                    <span className="max-w-[10rem] truncate text-[0.65rem] text-[var(--text-muted)]">{session.email}</span>
                    {session.plan !== "pro" ? (
                      <>
                        <span className="text-[var(--text-faint)]">·</span>
                        <Link href="/upgrade" className="text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                          Upgrade
                        </Link>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void clearSessionAndServer().then(() => {
                          setSession(null);
                          showSignedOutEmpty();
                        });
                      }}
                      className="text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/sign-in" className="text-[0.65rem] font-semibold text-[var(--accent)]">
                      Sign in
                    </Link>
                    <span className="text-[var(--text-faint)]">·</span>
                    <Link href="/sign-up" className="text-[0.65rem] font-medium text-[var(--text-muted)]">
                      Create account
                    </Link>
                    <span className="text-[var(--text-faint)]">·</span>
                    <Link href="/upgrade" className="text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                      Upgrade
                    </Link>
                  </>
                )}
              </div>
              {composerPanel}
              <p className="mt-0.5 pb-0.5 text-center text-[0.55rem] text-[var(--text-faint)] max-md:leading-tight md:mt-1 md:text-[0.6rem]">
                © {new Date().getFullYear()} FIGHURAI ·{" "}
                <Link href="/privacy" className="hover:text-[var(--text-muted)]">
                  Privacy
                </Link>{" "}
                ·{" "}
                <Link href="/terms" className="hover:text-[var(--text-muted)]">
                  Terms
                </Link>{" "}
                ·{" "}
                <Link href="/support" className="hover:text-[var(--text-muted)]">
                  Support
                </Link>
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {buildSidebarOpen ? (
        <BuildCanvas
          variant="sidebar"
          side={layoutPrefs.canvasSide}
          columnOrder={columnOrders.canvas}
          onResizeWidth={onResizeCanvasWidth}
          artifact={latestBuildArtifact}
          tab={buildPanelTab}
          onTabChange={setBuildPanelTab}
          selectedPath={selectedBuildFilePath}
          onSelectPath={setSelectedBuildFilePath}
          selectedSectionId={selectedCanvasSectionId}
          onSelectSection={setSelectedCanvasSectionId}
          onEditSection={handleEditCanvasSection}
          onClose={() => setCanvasOpen(false)}
        />
      ) : null}
      {buildSidebarOpen ? (
        <BuildCanvas
          variant="sheet"
          artifact={latestBuildArtifact}
          tab={buildPanelTab}
          onTabChange={setBuildPanelTab}
          selectedPath={selectedBuildFilePath}
          onSelectPath={setSelectedBuildFilePath}
          selectedSectionId={selectedCanvasSectionId}
          onSelectSection={setSelectedCanvasSectionId}
          onEditSection={handleEditCanvasSection}
          onClose={() => setCanvasOpen(false)}
        />
      ) : null}

      <DeviceOpsModal
        open={deviceOpsOpen}
        payload={pendingDeviceOps}
        applying={deviceOpsApplying}
        resultMessage={deviceOpsResult}
        canWrite={deviceCanWrite}
        onDownloadSafari={() => {
          if (!pendingDeviceOps) return;
          downloadSafariOrganizeScript(pendingDeviceOps, deviceOpsRootName);
          setDeviceOpsResult(
            "Downloaded fighur-organize.command — open it from Downloads, pick your folder, and press Enter when done.",
          );
        }}
        onCancel={() => {
          setDeviceOpsOpen(false);
          setPendingDeviceOps(null);
          setDeviceOpsResult(null);
        }}
        onReconnect={() => {
          const userId = readSession()?.userId;
          if (!userId) {
            setDeviceOpsResult("Sign in required.");
            return;
          }
          setDeviceOpsApplying(true);
          setDeviceOpsResult(null);
          void connectDeviceFolder(userId)
            .then((result) => {
              if (result.ok) {
                const next = readConnectedServices(userId);
                next.services.deviceFiles = {
                  connected: true,
                  label: `${result.rootName} (read & organize)`,
                };
                writeConnectedServices(next, userId);
                setDeviceCanWrite(true);
                setDeviceOpsResult("Folder reconnected. Click Apply again.");
              } else if (!("cancelled" in result && result.cancelled)) {
                setDeviceOpsResult("error" in result ? result.error : "Could not reconnect.");
              }
            })
            .finally(() => setDeviceOpsApplying(false));
        }}
        onApply={() => {
          const userId = readSession()?.userId;
          const payload = pendingDeviceOps;
          if (!userId || !payload) {
            setDeviceOpsResult("Sign in required to apply file changes.");
            return;
          }
          const cachedHandle = getCachedDeviceDirectoryHandle(userId);
          const permissionPromise = cachedHandle
            ? beginWritePermissionRequest(cachedHandle)
            : null;
          setDeviceOpsApplying(true);
          setDeviceOpsResult(null);
          void (async () => {
            try {
              const prep = await prepareDeviceWriteAccessFromClick(
                userId,
                cachedHandle,
                permissionPromise,
              );
              if (!prep.ok) {
                setDeviceOpsResult(prep.error);
                setDeviceCanWrite(false);
                return;
              }
              setDeviceCanWrite(true);
              const result = await applyDeviceFileOpsWithHandle(prep.handle, payload);
              if (result.applied === 0 && result.errors.length > 0) {
                setDeviceOpsResult(result.errors.slice(0, 5).join(" "));
                return;
              }
              const msg =
                result.errors.length > 0
                  ? `Applied ${result.applied} of ${payload.ops.length}. Some issues: ${result.errors.slice(0, 2).join("; ")}`
                  : `Applied ${result.applied} change${result.applied === 1 ? "" : "s"} successfully.`;
              setDeviceOpsResult(msg);
              if (result.applied > 0 && result.errors.length === 0) {
                window.setTimeout(() => {
                  setDeviceOpsOpen(false);
                  setPendingDeviceOps(null);
                  setDeviceOpsResult(null);
                }, 1200);
              }
            } catch (e) {
              setDeviceOpsResult(e instanceof Error ? e.message : "Apply failed.");
            } finally {
              setDeviceOpsApplying(false);
            }
          })();
        }}
      />
      <SiteTutorial
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        onFinished={markTutorialDone}
      />
    </div>
  );
}
