"use client";

import Image from "next/image";
import Link from "next/link";
import Markdown from "react-markdown";
import type { ChangeEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { ChatBuildArtifact, ChatMessage } from "@/lib/chat-types";
import { promptRequestsBuildWorkspace } from "@/lib/infer-builder-target";
import {
  clearSessionAndServer,
  hydrateServerSession,
  readSession,
  type SmileSession,
} from "@/lib/auth-storage";
import { readConnectedServices, toConnectedServicesPayload } from "@/lib/connected-services";
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

const SUGGESTIONS = [
  "Build a small Next.js web app that lists tasks and saves them in localStorage.",
  "Build a single-page marketing site in HTML/CSS for a local coffee shop.",
  "Design a Gmail + Calendar workflow to follow up on leads (no sending — plan only).",
  "Explain async/await like I'm brand new to JavaScript.",
  "Help me write a polite follow-up email after an interview.",
];

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

function extractBuildArtifact(text: string): BuildArtifact | null {
  const fence = /```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  const matches: BuildArtifact[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = fence.exec(text)) !== null) {
    matches.push({
      language: (match[1] || "text").toLowerCase(),
      code: match[2].trim(),
    });
  }
  if (matches.length === 0) return null;
  const preferred = matches.find((m) =>
    ["html", "tsx", "jsx", "javascript", "typescript"].includes(m.language),
  );
  return preferred ?? matches[0];
}

function stripCodeFences(text: string): string {
  const withoutCode = text.replace(/```[a-zA-Z0-9_-]*[ \t]*\r?\n[\s\S]*?```/g, "");
  return withoutCode.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeAssistantMessages(list: ChatMessage[]): ChatMessage[] {
  return list.map((m) =>
    m.role === "assistant"
      ? {
          ...m,
          content: stripCodeFences(m.content) || "Build details are in the workspace tabs.",
        }
      : m,
  );
}

const AssistantMessageBody = memo(function AssistantMessageBody({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    return (
      <p className="stream-plain whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">
        {content || "\u00a0"}
        <span className="stream-cursor" aria-hidden />
      </p>
    );
  }
  if (!content) return null;
  return (
    <div className="studio-md">
      <Markdown>{content}</Markdown>
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
        const fallback = next.find((m) => m.available)?.id ?? "";
        const def = data.defaultModel;
        const defOk = def && next.some((m) => m.id === def && m.available);
        setSelectedModel(defOk ? def : fallback);
        if (!defOk && !fallback) {
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

  useEffect(() => {
    if (models.length === 0) return;
    const selected = models.find((m) => m.id === selectedModel);
    if (selected?.available) return;
    const firstAvailable = models.find((m) => m.available);
    if (firstAvailable) setSelectedModel(firstAvailable.id);
  }, [models, selectedModel]);

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

    const modelMeta = models.find((m) => m.id === selectedModel);
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
        if (snapshot.includes("```")) {
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
  }, [input, pending, translatingSpeech, activeId, selectedModel, attachments, session]);

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
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canPreviewHtml =
    latestBuildArtifact?.language === "html" && latestBuildArtifact.code.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="hidden min-h-0 w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[var(--bg-elevated)]/90 md:flex">
        <div className="shrink-0 border-b border-white/[0.06] p-3">
          <button onClick={newChat} className="w-full rounded-xl bg-[var(--accent)]/15 px-3 py-2.5 text-sm font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25">+ New chat</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">Previous chats</p>
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-[var(--text-faint)]">Saved on this device. Start a message to create your first chat.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div className={`group flex items-start gap-1 rounded-xl ${activeId === c.id ? "bg-white/[0.08] ring-1 ring-white/[0.1]" : "hover:bg-white/[0.04]"}`}>
                    <button onClick={() => selectConversation(c)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                      <span className="line-clamp-2 text-xs font-medium text-[var(--text-primary)]">{c.title || deriveTitle(c.messages)}</span>
                      <span className="mt-0.5 block text-[0.65rem] text-[var(--text-faint)]">{formatTime(c.updatedAt)}</span>
                    </button>
                    <button onClick={(e) => deleteConversation(e, c.id)} className="shrink-0 rounded-lg p-2 text-[var(--text-faint)] opacity-0 hover:bg-white/[0.08] hover:text-red-300 group-hover:opacity-100">×</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <p className="px-0.5 pb-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">Account</p>
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
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col px-2 pb-4 pt-3 sm:px-4 sm:pt-4 md:pt-6">
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
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => lastAssistant?.content && navigator.clipboard.writeText(lastAssistant.content)} disabled={!lastAssistant?.content} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-[var(--text-muted)] disabled:opacity-40">
              Copy last reply
            </button>
          </div>

          <div ref={listRef} className="chat-scroll mb-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
            {showEmpty ? (
              <div className="flex flex-col items-center justify-center px-2 pb-6 pt-6 text-center">
                <Image
                  src="/images/smile-logo-transparent.png"
                  alt="Smile AI"
                  width={52}
                  height={52}
                  className="h-12 w-12 object-contain"
                  priority
                />
                <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[0.65rem] leading-snug text-[var(--text-muted)] hover:border-[var(--accent)]/25 hover:text-[var(--text-primary)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-[var(--accent)]/12 text-[var(--text-primary)] ring-1 ring-[var(--accent)]/20" : "bg-white/[0.03] text-[var(--text-muted)] ring-1 ring-white/[0.06]"}`}>
                    {m.role === "assistant" ? (
                      <AssistantMessageBody
                        content={m.content}
                        isStreaming={pending && streamingMessageId === m.id}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sticky bottom-0 z-30 mx-auto w-full min-w-0 max-w-2xl shrink-0 px-1 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-2">
            <div
              className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[var(--bg-deep)] to-transparent"
              aria-hidden
            />
            <div className="mb-2 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-[var(--bg-deep)]/80 py-2 md:hidden">
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
            <div className="composer-float min-w-0 -translate-y-0.5 overflow-hidden rounded-2xl border border-white/[0.14] bg-[var(--bg-elevated)]/95 p-1 backdrop-blur-xl">
              <form
                className="flex w-full min-w-0 max-w-full flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                {translatingSpeech ? <p className="px-3 py-2 text-xs text-[var(--accent)]">Refining your speech into clean text…</p> : null}
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
                  placeholder="Ask anything, or describe an app or site to build…"
                  rows={2}
                  className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none"
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
                    <button
                      type="button"
                      onClick={() => setBuildSidebarOpen((v) => !v)}
                      className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)]/40"
                    >
                      <span className="sm:hidden">Space</span>
                      <span className="hidden sm:inline">Workspace</span>
                    </button>
                  </div>
                  <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={busy}
                      className="min-w-0 w-full max-w-full truncate appearance-none rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] outline-none transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-[13rem] sm:px-4 sm:py-2"
                      aria-label="Select model"
                    >
                      {models.length === 0 ? (
                        <option value="">Loading…</option>
                      ) : (
                        models.map((m) => (
                          <option key={m.id} value={m.id} disabled={!m.available}>
                            {m.label}
                            {m.available ? "" : " (unavailable)"}
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
            ) : (
              <p className="mt-2 px-1 text-center text-[0.65rem] text-[var(--text-faint)]">
                Chats saved in this browser · Model picker enabled · Speech can refine your input
              </p>
            )}
          </div>
        </div>
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
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
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
            <span className="ml-auto text-[0.65rem] tracking-wide text-[var(--text-faint)]">Prompt</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {buildPanelTab === "preview" ? (
              canPreviewHtml ? (
                <iframe
                  title="Build preview"
                  sandbox="allow-scripts allow-forms allow-modals"
                  srcDoc={latestBuildArtifact?.code ?? ""}
                  className="h-full min-h-[24rem] w-full rounded-xl border border-white/[0.12] bg-white"
                />
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                  {latestBuildArtifact
                    ? "Preview is available for HTML artifacts. Ask Smile AI to return a full ```html block for live website preview."
                    : "Build output will appear here after you click Build."}
                </div>
              )
            ) : latestBuildArtifact ? (
              <pre className="overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 text-xs text-[var(--text-primary)]">
                <code>{latestBuildArtifact.code}</code>
              </pre>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                No code artifact yet. Ask Smile AI to generate code for what you are building.
              </div>
            )}
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
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
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
          </div>
          <div className="h-[calc(100%-5.5rem)] overflow-auto p-3">
            {buildPanelTab === "preview" ? (
              canPreviewHtml ? (
                <iframe
                  title="Build preview mobile"
                  sandbox="allow-scripts allow-forms allow-modals"
                  srcDoc={latestBuildArtifact?.code ?? ""}
                  className="h-full min-h-[22rem] w-full rounded-xl border border-white/[0.12] bg-white"
                />
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                  Preview is available for HTML artifacts.
                </div>
              )
            ) : latestBuildArtifact ? (
              <pre className="overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 text-xs text-[var(--text-primary)]">
                <code>{latestBuildArtifact.code}</code>
              </pre>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                No code artifact yet. Ask Smile AI to generate code for what you are building.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
