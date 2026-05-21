"use client";

import Link from "next/link";
import Markdown from "react-markdown";
import type { ChangeEvent, MouseEvent } from "react";
import type { Components } from "react-markdown";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatBuildArtifact, ChatMessage } from "@/lib/chat-types";
import { promptRequestsBuildWorkspace } from "@/lib/infer-builder-target";
import {
  clearSessionAndServer,
  hydrateServerSession,
  readSession,
  type SmileSession,
} from "@/lib/auth-storage";
import { readConnectedServices, toConnectedServicesPayload } from "@/lib/connected-services";
import { extractBuildArtifact, stripCodeFences } from "@/lib/build-artifact";
import { DEFAULT_CHAT_MODEL_ID, PROMPT_PLACEHOLDER } from "@/lib/site-brand";
import {
  downloadBuildCode,
  downloadImageUrl,
  extractAllImagePreviewUrls,
  isImageArtifact,
  resolveImagePreviewUrl,
} from "@/lib/workspace-download";
import {
  deriveTitle,
  loadConversations,
  loadLastActiveId,
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
  kind: "text" | "image" | "binary";
  content: string;
};

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_DATA_URL_CHARS = 120_000;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function sanitizeAssistantMessages(list: ChatMessage[]): ChatMessage[] {
  return list.map((m) =>
    m.role === "assistant"
      ? {
          ...m,
          content:
            stripCodeFences(m.content) ||
            (extractAllImagePreviewUrls(m.content).length > 0
              ? m.content
              : "Build details are in the workspace tabs."),
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
}: {
  content: string;
  isStreaming: boolean;
  imageFallback?: string | null;
}) {
  const displayContent = useMemo(() => {
    if (isStreaming) return content;
    const narration = stripCodeFences(content);
    if (narration) return narration;
    if (imageFallback) return `![Generated image](${imageFallback})`;
    return content;
  }, [content, isStreaming, imageFallback]);

  if (isStreaming) {
    return (
      <p className="stream-plain w-full min-w-0 max-w-full break-words whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">
        {content || "\u00a0"}
        <span className="stream-cursor" aria-hidden />
      </p>
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read error"));
    reader.readAsDataURL(file);
  });
}

async function imageFileToCompressedDataUrl(file: File): Promise<string> {
  const sourceUrl = await fileToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = sourceUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.85, 0.7, 0.55, 0.4];
  for (const q of qualities) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= MAX_IMAGE_DATA_URL_CHARS) return out;
  }
  const fallback = canvas.toDataURL("image/jpeg", 0.3);
  if (fallback.length <= MAX_IMAGE_DATA_URL_CHARS) return fallback;
  throw new Error("Image is too large after compression. Try a smaller image.");
}

export function SmileChatGeneral() {
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [translatingSpeech, setTranslatingSpeech] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [models, setModels] = useState<ChatModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [chatReady, setChatReady] = useState<boolean | null>(null);
  const [buildSidebarOpen, setBuildSidebarOpen] = useState(false);
  const [buildPanelTab, setBuildPanelTab] = useState<BuildPanelTab>("preview");
  const [latestBuildArtifact, setLatestBuildArtifact] = useState<BuildArtifact | null>(null);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [session, setSession] = useState<SmileSession | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const promptifyAbortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const latestTranscriptRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sendInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setSession(readSession());
    const onAuth = () => setSession(readSession());
    window.addEventListener("smile-auth-changed", onAuth);
    return () => window.removeEventListener("smile-auth-changed", onAuth);
  }, []);

  useEffect(() => {
    void hydrateServerSession().then(() => {
      setSession(readSession());
    });
  }, []);

  useEffect(() => {
    const list = loadConversations("assistant");
    setConversations(list);
    const last = loadLastActiveId("assistant");
    if (last && list.some((c) => c.id === last)) {
      const c = list.find((x) => x.id === last)!;
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(last);
      setMessages(sanitizeAssistantMessages(c.messages));
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(Boolean(fallbackArtifact));
    } else if (list.length > 0) {
      const c = list[0];
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(c.id);
      setMessages(sanitizeAssistantMessages(c.messages));
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(Boolean(fallbackArtifact));
      saveLastActiveId(c.id, "assistant");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void fetch("/api/chat/models")
      .then((r) => r.json())
      .then((data: {
        models?: ChatModelInfo[];
        defaultModel?: string | null;
        chatReady?: boolean;
        setupHint?: string;
      }) => {
        const next = Array.isArray(data.models) ? data.models : [];
        setModels(next);
        setChatReady(data.chatReady === true);
        const available = next.filter((m) => m.available);
        const claude = available.find((m) => m.id === DEFAULT_CHAT_MODEL_ID);
        const def = data.defaultModel;
        const defOk = def && available.some((m) => m.id === def);
        setSelectedModel(defOk ? def! : claude?.id ?? available[0]?.id ?? "");
        if (available.length === 0) {
          setError(
            data.setupHint ??
              "Chat is not configured: add an API key in Vercel for the fighur.ai project and redeploy.",
          );
        }
      })
      .catch(() => {
        setError("Could not load model list.");
      });
  }, []);

  const availableModels = useMemo(() => models.filter((m) => m.available), [models]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (availableModels.some((m) => m.id === selectedModel)) return;
    const claude = availableModels.find((m) => m.id === DEFAULT_CHAT_MODEL_ID);
    setSelectedModel(claude?.id ?? availableModels[0].id);
  }, [availableModels, selectedModel]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: pending ? "auto" : "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    if (!hydrated || !activeId || messages.length === 0) return;
    setConversations((prev) => {
      const merged = upsertConversation(prev, {
        id: activeId,
        messages,
        title: deriveTitle(messages),
        updatedAt: Date.now(),
        buildArtifact: latestBuildArtifact,
      });
      persistConversations(merged, "assistant");
      return merged;
    });
    saveLastActiveId(activeId, "assistant");
  }, [messages, activeId, hydrated, latestBuildArtifact]);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    promptifyAbortRef.current?.abort();
    promptifyAbortRef.current = null;
    setPending(false);
    setTranslatingSpeech(false);
  }, []);

  const newChat = useCallback(() => {
    stopAll();
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLatestBuildArtifact(null);
    setBuildSidebarOpen(false);
    setAttachments([]);
    saveLastActiveId(null, "assistant");
    setMobileSidebarOpen(false);
  }, [stopAll]);

  useEffect(() => {
    const onHome = () => newChat();
    window.addEventListener("smile-go-home", onHome);
    return () => window.removeEventListener("smile-go-home", onHome);
  }, [newChat]);

  const selectConversation = useCallback(
    (c: SavedConversation) => {
      stopAll();
      const fallbackArtifact =
        c.buildArtifact ??
        extractBuildArtifact([...c.messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setActiveId(c.id);
      setMessages(sanitizeAssistantMessages(c.messages));
      setInput("");
      setError(null);
      setLatestBuildArtifact(fallbackArtifact);
      setBuildSidebarOpen(Boolean(fallbackArtifact));
      saveLastActiveId(c.id, "assistant");
      setMobileSidebarOpen(false);
    },
    [stopAll],
  );

  const deleteConversation = useCallback(
    (ev: MouseEvent<HTMLButtonElement>, convId: string) => {
      ev.stopPropagation();
      const next = removeConversation(conversations, convId);
      setConversations(next);
      persistConversations(next, "assistant");
      if (activeId === convId) {
        if (next.length > 0) selectConversation(next[0]);
        else {
          setLatestBuildArtifact(null);
          setBuildSidebarOpen(false);
          newChat();
        }
      }
    },
    [conversations, activeId, selectConversation, newChat],
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

  const onPickFiles = useCallback(
    async (ev: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(ev.target.files ?? []);
      if (files.length === 0) return;

      const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      if (remaining <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files per prompt.`);
        ev.target.value = "";
        return;
      }

      const picked = files.slice(0, remaining);
      const next: PromptAttachment[] = [];

      for (const file of picked) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`"${file.name}" is too large. Max size is ${humanFileSize(MAX_ATTACHMENT_BYTES)}.`);
          continue;
        }

        try {
          let kind: PromptAttachment["kind"] = "binary";
          let content = "";
          if (file.type.startsWith("image/")) {
            kind = "image";
            content = await imageFileToCompressedDataUrl(file);
          } else if (
            file.type.startsWith("text/") ||
            /\.(txt|md|json|csv|html|css|js|ts|tsx|jsx|xml|yml|yaml)$/i.test(file.name)
          ) {
            kind = "text";
            content = await file.text();
          }

          next.push({
            id: id(),
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind,
            content,
          });
        } catch {
          setError(`Could not read "${file.name}".`);
        }
      }

      if (next.length > 0) {
        setAttachments((prev) => [...prev, ...next]);
        setError(null);
      }

      ev.target.value = "";
    },
    [attachments.length],
  );

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending || translatingSpeech || sendInFlightRef.current) return;

    const modelMeta = availableModels.find((m) => m.id === selectedModel);
    if (!modelMeta?.available) {
      setError(
        modelMeta
          ? `${modelMeta.label} is unavailable — add its API key in Vercel Environment Variables and redeploy, or choose another model.`
          : "No model is available. Add at least one API key in Vercel (e.g. ANTHROPIC_API_KEY) and redeploy.",
      );
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
    if (promptRequestsBuildWorkspace(trimmed)) {
      setBuildSidebarOpen(true);
      setBuildPanelTab("preview");
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const reqTid = window.setTimeout(() => controller.abort(), 120_000);
    const history = nextMessages
      .filter((m) => m.id !== assistantId)
      .map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          model: selectedModel,
          attachments: attachmentsForRequest,
          connectedServices: toConnectedServicesPayload(readConnectedServices()),
          userSession: session
            ? {
                email: session.email,
                name: session.name,
                ...(session.userId ? { userId: session.userId } : {}),
              }
            : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let fullText = "";
      let rafId: number | null = null;
      let streamPumpActive = true;
      let lastArtifactCheck = 0;

      setStreamingMessageId(assistantId);

      const applyStreamToUi = () => {
        const snapshot = fullText;
        if (snapshot.includes("```") || snapshot.includes("data:image") || snapshot.includes("![")) {
          const now = performance.now();
          if (now - lastArtifactCheck > 280) {
            lastArtifactCheck = now;
            const artifact = extractBuildArtifact(snapshot);
            if (artifact) {
              setLatestBuildArtifact(artifact);
              setBuildSidebarOpen(true);
              setBuildPanelTab("preview");
            }
          }
        }
        const narration = stripCodeFences(snapshot);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    narration ||
                    (snapshot.includes("```") ? "Code is in the Build Workspace." : ""),
                }
              : m,
          ),
        );
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      };

      const pumpFrames = () => {
        if (!streamPumpActive) return;
        applyStreamToUi();
        rafId = requestAnimationFrame(pumpFrames);
      };
      rafId = requestAnimationFrame(pumpFrames);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
        fullText += decoder.decode();
      } finally {
        streamPumpActive = false;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyStreamToUi();
        setStreamingMessageId(null);
      }

      if (!fullText.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "I'm here — try that again and I'll answer." }
              : m,
          ),
        );
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const message = e instanceof Error ? e.message : "Something went wrong.";
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `_Error: ${message}_` } : m,
          ),
        );
      }
    } finally {
      clearTimeout(reqTid);
      setPending(false);
      setStreamingMessageId(null);
      abortRef.current = null;
      sendInFlightRef.current = false;
    }
  }, [input, pending, translatingSpeech, activeId, selectedModel, attachments, session, availableModels]);

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
  const busy = pending || translatingSpeech;
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
  const canPreviewImage = Boolean(previewImageUrl);
  const canPreviewHtml =
    !canPreviewImage &&
    (latestBuildArtifact?.language === "html" || latestBuildArtifact?.language === "htm") &&
    Boolean(latestBuildArtifact?.code.trim());

  const downloadWorkspaceCode = useCallback(() => {
    if (!latestBuildArtifact) return;
    downloadBuildCode(latestBuildArtifact);
  }, [latestBuildArtifact]);

  const downloadWorkspaceImage = useCallback(async () => {
    if (!previewImageUrl) return;
    try {
      await downloadImageUrl(previewImageUrl);
    } catch {
      setError("Could not download image. Try again or save from preview.");
    }
  }, [previewImageUrl]);

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
      <div className="composer-float box-border w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.14] bg-[var(--bg-elevated)]/95 p-1 backdrop-blur-xl sm:rounded-2xl">
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
          <textarea
            id="smile-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={PROMPT_PLACEHOLDER}
            rows={showEmpty ? 3 : 2}
            className="box-border w-full max-w-full resize-none break-words bg-transparent px-3 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none"
            disabled={busy}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onPickFiles}
            className="hidden"
            accept="*/*"
          />
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-2 py-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-[0.7rem] text-[var(--text-muted)]"
                >
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
              ))}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-2 border-t border-white/[0.06] px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={toggleListen}
                disabled={busy}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
              >
                {listening ? "Stop" : "Speak"}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-40"
              >
                Attach
              </button>
              {!showEmpty ? (
                <button
                  type="button"
                  onClick={() => setBuildSidebarOpen((v) => !v)}
                  className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/40"
                >
                  <span className="sm:hidden">Space</span>
                  <span className="hidden sm:inline">Workspace</span>
                </button>
              ) : null}
            </div>
            <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={busy || availableModels.length === 0}
                className="min-w-0 w-full max-w-full truncate appearance-none rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] outline-none transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-[13rem] sm:px-4 sm:py-2"
                aria-label="Select model"
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
              <div className="flex shrink-0 items-center gap-1.5">
                {busy ? (
                  <button
                    type="button"
                    onClick={stopAll}
                    className="rounded-full px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
                  >
                    Stop
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="shrink-0 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] disabled:opacity-40 sm:px-4 sm:py-2"
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
        <p className="mt-1 hidden px-1 text-center text-[0.65rem] text-[var(--text-faint)] sm:block">
          Chats saved in this browser · Model picker enabled · Speech can refine your input
        </p>
      ) : null}
    </>
  );

  const workspaceDownloadButtons =
    latestBuildArtifact || previewImageUrl ? (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {latestBuildArtifact && !isImageArtifact(latestBuildArtifact) ? (
          <button
            type="button"
            onClick={downloadWorkspaceCode}
            className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-primary)] hover:bg-white/[0.08]"
          >
            {canPreviewHtml ? "Download HTML" : "Download code"}
          </button>
        ) : null}
        {previewImageUrl ? (
          <button
            type="button"
            onClick={() => void downloadWorkspaceImage()}
            className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
          >
            Download image
          </button>
        ) : null}
      </div>
    ) : null;

  const workspacePreviewBody = previewImageUrl ? (
    <img
      src={previewImageUrl}
      alt="Generated preview"
      className="mx-auto max-h-[min(70vh,32rem)] w-full rounded-xl border border-white/[0.12] bg-black/20 object-contain"
    />
  ) : canPreviewHtml ? (
    <iframe
      title="Build preview"
      sandbox="allow-scripts allow-forms allow-modals"
      srcDoc={latestBuildArtifact?.code ?? ""}
      className="h-full min-h-[24rem] w-full rounded-xl border border-white/[0.12] bg-white"
    />
  ) : (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
      {latestBuildArtifact
        ? "Preview works for HTML pages and images. Ask for a full ```html block or an image."
        : "Build output will appear here after you generate code or an image."}
    </div>
  );

  const workspaceCodeBody = latestBuildArtifact ? (
    <pre className="overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 text-xs text-[var(--text-primary)]">
      <code>{latestBuildArtifact.code}</code>
    </pre>
  ) : (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
      No code artifact yet. Describe what you are building to generate code here.
    </div>
  );

  const workspaceTabRow = (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
      <button
        type="button"
        onClick={() => setBuildPanelTab("preview")}
        className={`rounded-full px-3 py-1 text-xs ${
          buildPanelTab === "preview"
            ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-white/[0.06]"
        }`}
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => setBuildPanelTab("code")}
        className={`rounded-full px-3 py-1 text-xs ${
          buildPanelTab === "code"
            ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-white/[0.06]"
        }`}
      >
        Code
      </button>
      {workspaceDownloadButtons}
    </div>
  );

  const sidebarContent = (
    <>
      <div className="shrink-0 border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={newChat}
          className="w-full rounded-xl bg-[var(--accent)]/15 px-3 py-2.5 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25 transition hover:bg-[var(--accent)]/25"
        >
          + New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
            <button
              type="button"
              onClick={() => {
                void clearSessionAndServer().then(() => setSession(null));
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
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`flex flex-1 flex-col md:flex-row ${showEmpty ? "min-h-[calc(100dvh-3.25rem)]" : "min-h-0"}`}
    >
      <aside className="hidden min-h-0 w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[var(--bg-elevated)]/90 md:flex">
        {sidebarContent}
      </aside>

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

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2 md:hidden">
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
        </div>

        <div
          className={`flex w-full min-w-0 flex-1 flex-col px-4 pb-2 sm:px-6 md:px-8 ${showEmpty ? "min-h-0 pt-0" : "pt-3 sm:pt-4 md:pt-6"}`}
        >
          {chatReady === false ? (
            <div
              className="mb-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-amber-100/95"
              role="status"
            >
              <p className="font-semibold text-amber-50">Chat models are unavailable on the server</p>
              <p className="mt-1.5 text-amber-100/90">
                Every model shows “unavailable” because this Vercel project has{" "}
                <strong>no API keys</strong> yet. Keys on another site (e.g. fighurai.com) do not apply here —
                add them to the <strong>fighur.ai</strong> project.
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-amber-100/85">
                <li>
                  Vercel → <strong>fighur.ai</strong> project → Settings → Environment Variables
                </li>
                <li>
                  Add one key for <strong>Production</strong> (easiest free option:{" "}
                  <code className="text-[0.65rem]">GROQ_API_KEY</code> from{" "}
                  <a
                    href="https://console.groq.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    console.groq.com
                  </a>
                  , or <code className="text-[0.65rem]">ANTHROPIC_API_KEY</code> for Claude)
                </li>
                <li>Deployments → Redeploy (required after adding variables)</li>
                <li>Refresh this page — models should no longer say unavailable</li>
              </ol>
            </div>
          ) : null}

          {showEmpty ? (
            <div className="home-empty-hero">
              <div className="composer-column mx-auto w-full max-w-2xl px-3 sm:px-4">{composerPanel}</div>
            </div>
          ) : (
            <div
              ref={listRef}
              className="chat-scroll chat-thread mx-auto mb-2 min-h-0 w-full max-w-2xl flex-1 space-y-4 overflow-y-auto pb-36 md:pb-32"
            >
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
                      className={`relative min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed sm:px-5 ${
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
          )}

        </div>

        {!showEmpty ? (
          <div
            className={`composer-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 md:left-56 ${buildSidebarOpen ? "md:right-[min(40rem,42vw)]" : ""}`}
          >
            <div className="composer-dock-inner composer-column pointer-events-auto mx-auto w-full min-w-0 max-w-2xl px-3 sm:px-4">
              <div
                className="pointer-events-none mb-1 h-6 bg-gradient-to-t from-[var(--bg-deep)] to-transparent"
                aria-hidden
              />
              <div className="mb-1.5 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-[var(--bg-deep)]/90 py-1.5 md:hidden">
                {session ? (
                  <>
                    <span className="max-w-[14rem] truncate text-xs text-[var(--text-muted)]">{session.email}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void clearSessionAndServer().then(() => setSession(null));
                      }}
                      className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/sign-in" className="text-xs font-semibold text-[var(--accent)]">
                      Sign in
                    </Link>
                    <span className="text-[var(--text-faint)]">·</span>
                    <Link href="/sign-up" className="text-xs font-medium text-[var(--text-muted)]">
                      Create account
                    </Link>
                  </>
                )}
              </div>
              {composerPanel}
              <p className="mt-1 pb-0.5 text-center text-[0.6rem] text-[var(--text-faint)]">
                © {new Date().getFullYear()} FIGHURAI
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {buildSidebarOpen ? (
        <aside className="hidden w-[min(40rem,42vw)] shrink-0 border-l border-white/[0.08] bg-[var(--bg-elevated)]/80 backdrop-blur-md md:flex md:flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Build Workspace</p>
            <button
              type="button"
              onClick={() => setBuildSidebarOpen(false)}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              Close
            </button>
          </div>
          {workspaceTabRow}
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {buildPanelTab === "preview" ? workspacePreviewBody : workspaceCodeBody}
          </div>
        </aside>
      ) : null}
      {buildSidebarOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-20 z-[95] border-t border-white/[0.08] bg-[var(--bg-elevated)]/95 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Build Workspace</p>
            <button
              type="button"
              onClick={() => setBuildSidebarOpen(false)}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              Close
            </button>
          </div>
          {workspaceTabRow}
          <div className="h-[calc(100%-5.5rem)] overflow-auto p-3">
            {buildPanelTab === "preview" ? workspacePreviewBody : workspaceCodeBody}
          </div>
        </div>
      ) : null}
    </div>
  );
}
