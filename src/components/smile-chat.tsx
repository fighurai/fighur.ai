"use client";

import Markdown from "react-markdown";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage } from "@/lib/chat-types";
import { resolveBookingHref } from "@/lib/booking-from-prompt";
import { BOOKING_URL } from "@/lib/site-links";
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

/** Minimal handle for Web Speech API (non-standard across browsers). */
type SpeechSession = {
  start: () => void;
  stop: () => void;
};

const SUGGESTIONS = [
  "What services does FIGHURAI offer and how do I get started?",
  "How do I book a call with FIGHURAI?",
  "What’s the difference between consulting and membership?",
  "How do I contact you about a custom engagement?",
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

export function SmileChat() {
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [translatingSpeech, setTranslatingSpeech] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const promptifyAbortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const latestTranscriptRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Always latest messages for send() — avoids stale closure vs optimistic updates. */
  const messagesRef = useRef<ChatMessage[]>([]);
  /** Prevents double-submit before React re-renders pending=true. */
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const list = loadConversations();
    setConversations(list);
    const last = loadLastActiveId();
    if (last && list.some((c) => c.id === last)) {
      const c = list.find((x) => x.id === last)!;
      setActiveId(last);
      setMessages(c.messages);
    } else if (list.length > 0) {
      const c = list[0];
      setActiveId(c.id);
      setMessages(c.messages);
      saveLastActiveId(c.id);
    }
    setHydrated(true);
  }, []);

  // Follow new tokens without stacking smooth-scroll animations (that reads as “static” / janky).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: pending ? "auto" : "smooth",
    });
  }, [messages, pending]);

  useEffect(() => {
    if (!hydrated) return;
    if (!activeId) return;
    if (messages.length === 0) return;
    setConversations((prev) => {
      const merged = upsertConversation(prev, {
        id: activeId,
        messages,
        title: deriveTitle(messages),
        updatedAt: Date.now(),
      });
      persistConversations(merged);
      return merged;
    });
    saveLastActiveId(activeId);
  }, [messages, activeId, hydrated]);

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
    saveLastActiveId(null);
    setMobileSidebarOpen(false);
  }, [stopAll]);

  const selectConversation = useCallback(
    (c: SavedConversation) => {
      stopAll();
      setActiveId(c.id);
      setMessages(c.messages);
      setInput("");
      setError(null);
      saveLastActiveId(c.id);
      setMobileSidebarOpen(false);
    },
    [stopAll],
  );

  const deleteConversation = useCallback(
    (ev: MouseEvent<HTMLButtonElement>, convId: string) => {
      ev.stopPropagation();
      const next = removeConversation(conversations, convId);
      setConversations(next);
      persistConversations(next);
      if (activeId === convId) {
        if (next.length > 0) {
          selectConversation(next[0]);
        } else {
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

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg =
          typeof (errJson as { error?: string }).error === "string"
            ? (errJson as { error: string }).error
            : `Promptify failed (${res.status})`;
        throw new Error(msg);
      }

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
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Translation failed.";
      setError(msg);
      setInput(raw);
    } finally {
      clearTimeout(reqTid);
      setTranslatingSpeech(false);
      promptifyAbortRef.current = null;
    }
  }, []);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || pending || translatingSpeech || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    let convId = activeId;
    if (!convId) {
      convId = id();
      setActiveId(convId);
    }

    const userMsg: ChatMessage = { id: id(), role: "user", content: trimmed };
    const assistantId = id();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };
    // Build next transcript synchronously — do not read messagesRef only after
    // setMessages(updater), because the updater may not run before the fetch
    // body is built, leaving messages[] empty and /api/chat returning 400.
    const base = messagesRef.current;
    const nextMessages: ChatMessage[] = [...base, userMsg, assistantPlaceholder];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const reqTid = window.setTimeout(() => controller.abort(), 120_000);

    const history = nextMessages
      .filter((m) => m.id !== assistantId)
      .map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg =
          typeof (errJson as { error?: string }).error === "string"
            ? (errJson as { error: string }).error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let acc = "";
      let rafId: number | null = null;

      const flushStreamToUi = () => {
        rafId = null;
        const snapshot = acc;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: snapshot } : msg,
          ),
        );
      };

      const scheduleStreamFlush = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(flushStreamToUi);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          scheduleStreamFlush();
        }
        acc += decoder.decode();
      } finally {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        flushStreamToUi();
      }

      // Some providers can end a stream with no visible tokens; never leave users with a blank assistant bubble.
      if (!acc.trim()) {
        const fallback =
          "I’m here and ready to help. Please try sending that again, and I’ll respond right away.";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: fallback } : msg,
          ),
        );
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const errorMessage = e instanceof Error ? e.message : "Something went wrong.";
      setError(errorMessage);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `_Could not complete the reply: ${errorMessage}_` }
            : m,
        ),
      );
    } finally {
      clearTimeout(reqTid);
      setPending(false);
      abortRef.current = null;
      sendInFlightRef.current = false;
    }
  }, [input, pending, translatingSpeech, activeId]);

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
      const { results } = ev;
      let full = "";
      for (let i = 0; i < results.length; i++) {
        full += results.item(i).item(0).transcript;
      }
      latestTranscriptRef.current = full;
      setInput(full);
    };
    rec.onerror = () => {
      setListening(false);
      speechRef.current = null;
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

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const lastUserContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user") return m.content;
    }
    return "";
  }, [messages]);

  /** Acuity opens with `datetime=` when the box or last user message includes a parseable date+time */
  const bookingFromPrompt = useMemo(
    () => resolveBookingHref(BOOKING_URL, input.trim() || lastUserContent),
    [input, lastUserContent],
  );
  const bookingHref = bookingFromPrompt.href;

  const copyLast = useCallback(async () => {
    if (!lastAssistant?.content) return;
    await navigator.clipboard.writeText(lastAssistant.content);
  }, [lastAssistant]);

  const showEmpty = messages.length === 0;
  const busy = pending || translatingSpeech;

  const sidebarContent = (
    <>
      <div className="border-b border-white/[0.06] p-3">
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
                    className="shrink-0 rounded-lg p-2 text-[var(--text-faint)] opacity-0 transition hover:bg-white/[0.08] hover:text-red-300 group-hover:opacity-100"
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
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden min-h-0 w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[var(--bg-elevated)]/90 md:flex md:min-h-0 md:flex-col">
        {sidebarContent}
      </aside>

      {/* z-[90] is below site header (z-[100]) so nav tabs always receive clicks */}
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
          <aside className="absolute bottom-0 left-0 top-0 flex min-h-0 w-[min(18rem,88vw)] flex-col overflow-hidden border-r border-white/[0.06] bg-[var(--bg-elevated)] shadow-2xl">
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

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 pb-2 pt-3 sm:px-4 sm:pt-4 md:pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2 sm:mb-4">
            <button
              type="button"
              onClick={copyLast}
              disabled={!lastAssistant?.content}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition enabled:hover:border-[var(--accent)]/40 enabled:hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Copy last reply
            </button>
          </div>

          <div
            ref={listRef}
            className="chat-scroll mb-3 min-h-0 flex-1 space-y-4 overflow-y-auto sm:mb-4 sm:space-y-5"
          >
            {showEmpty ? (
              <div className="flex flex-col items-center justify-center px-2 pb-8 pt-4 text-center sm:min-h-[38vh] sm:pt-12">
                <p className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  fighur it out with ai
                </p>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
                  Services, booking, and how to work with us — local assistant for fighur.ai.
                </p>
                <a
                  href={bookingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_28px_var(--accent-glow)] transition hover:brightness-110"
                >
                  Book a session
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M7 17L17 7M17 7H9M17 7V15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                {bookingFromPrompt.parsedTime && (
                  <p className="mt-2 max-w-md text-xs leading-snug text-[var(--accent)]">
                    Acuity will open with your stated date and time prefilled — pick the exact slot that still
                    works there.
                  </p>
                )}
                <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setInput(s);
                        queueMicrotask(() =>
                          document.getElementById("fighurai-chat-input")?.focus(),
                        );
                      }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-xs leading-snug text-[var(--text-muted)] transition hover:border-[var(--accent)]/25 hover:bg-white/[0.06] hover:text-[var(--text-primary)] sm:text-[0.8125rem]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!showEmpty
              ? messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[90%] sm:px-4 sm:py-3 sm:text-[0.9375rem] ${
                        m.role === "user"
                          ? "bg-[var(--accent)]/12 text-[var(--text-primary)] ring-1 ring-[var(--accent)]/20"
                          : "bg-white/[0.03] text-[var(--text-muted)] ring-1 ring-white/[0.06]"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <div className="studio-md">
                          <Markdown>{m.content || (pending ? " " : "")}</Markdown>
                          {pending && m.content === "" ? (
                            <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--accent)] align-middle" />
                          ) : null}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-[var(--text-primary)]">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))
              : null}
            <div ref={bottomRef} />
          </div>

          <div className="relative z-20 shrink-0 pb-1">
            <div className="relative z-10 rounded-2xl border border-white/[0.12] bg-[var(--bg-elevated)]/90 p-1 shadow-[0_12px_48px_-20px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
              <div className="relative border-b border-white/[0.06] px-2 py-1.5 sm:px-3">
                <div
                  className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-2 py-1 text-xs text-[var(--text-muted)]"
                  role="status"
                  aria-label="fighur it out with ai chat"
                >
                  <span className="font-semibold text-[var(--text-primary)]">fighur it out with ai</span>
                  <span className="font-normal text-[var(--text-faint)]">Ask</span>
                  <span className="font-normal text-[0.65rem] text-[var(--text-faint)]">
                    · AI assistant
                  </span>
                </div>
              </div>
              <form
                className="flex w-full min-w-0 flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                {translatingSpeech ? (
                  <p className="px-3 py-2 text-xs text-[var(--accent)]">
                    Turning your speech into a clear message in this box…
                  </p>
                ) : null}
                <textarea
                  id="fighurai-chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask anything…"
                  rows={2}
                  className="relative z-10 w-full resize-none bg-transparent px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none sm:text-[0.9375rem]"
                  disabled={pending || translatingSpeech}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-2 py-2">
                <button
                  type="button"
                  onClick={toggleListen}
                  disabled={busy}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                    listening
                      ? "bg-red-500/15 text-red-300 ring-1 ring-red-400/30"
                      : "text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  }`}
                  title="Stop when finished — your words appear in this box for editing"
                >
                  <span className="relative flex h-2 w-2">
                    {listening ? (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                    ) : null}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${listening ? "bg-red-400" : "bg-[var(--text-faint)]"}`}
                    />
                  </span>
                  {listening ? "Stop & translate" : "Speak"}
                </button>

                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                  {busy ? (
                    <button
                      type="button"
                      onClick={stopAll}
                      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                    >
                      Stop
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_20px_var(--accent-glow)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
                </div>
              </form>
            </div>
            {error ? (
              <p className="mt-2 text-center text-xs text-red-300/90">{error}</p>
            ) : (
              <p className="mt-2 text-center text-[0.65rem] text-[var(--text-faint)]">
                <a
                  href={bookingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Book a session
                </a>{" "}
                opens Acuity
                {bookingFromPrompt.parsedTime ? " with your typed date & time when recognized" : ""} · Chats
                saved in this browser · Speech refines your message
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
