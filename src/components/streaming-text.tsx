"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";

import { streamingMarkdownView } from "@/lib/streaming-markdown";

export type StreamingTextHandle = {
  reset: () => void;
  push: (chunk: string) => void;
  replaceAll: (text: string) => void;
  /** Instantly show everything buffered (call when the network stream ends). */
  flush: () => void;
  getLength: () => number;
};

type StreamingTextProps = {
  className?: string;
  showCursor?: boolean;
  onUpdate?: () => void;
  onFirstOutput?: () => void;
  components?: Components;
};

/** Target reveal speed — ChatGPT/Claude-like steady flow, catches up when behind. */
const BASE_CHARS_PER_SEC = 90;
const MAX_CATCHUP_CHARS_PER_SEC = 320;
const MIN_FRAME_MS = 1000 / 60;

export const StreamingText = forwardRef<StreamingTextHandle, StreamingTextProps>(
  function StreamingText(
    { className = "", showCursor = true, onUpdate, onFirstOutput, components },
    ref,
  ) {
    const [view, setView] = useState("");
    const fullRef = useRef("");
    const revealedLenRef = useRef(0);
    const notifiedRef = useRef(false);
    const rafRef = useRef(0);
    const lastTsRef = useRef(0);
    const lastPaintTsRef = useRef(0);
    const onUpdateRef = useRef(onUpdate);
    const onFirstOutputRef = useRef(onFirstOutput);
    onUpdateRef.current = onUpdate;
    onFirstOutputRef.current = onFirstOutput;

    const stopLoop = useCallback(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      lastTsRef.current = 0;
      lastPaintTsRef.current = 0;
    }, []);

    const paint = useCallback((revealedText: string, force = false) => {
      const now = performance.now();
      // Cap Markdown remounts ~30fps — smoother than re-parsing every RAF.
      if (!force && lastPaintTsRef.current && now - lastPaintTsRef.current < 32) {
        return false;
      }
      lastPaintTsRef.current = now;
      const narration = streamingMarkdownView(revealedText);
      if (narration && !notifiedRef.current) {
        notifiedRef.current = true;
        onFirstOutputRef.current?.();
      }
      setView(narration);
      onUpdateRef.current?.();
      return true;
    }, []);

    const tick = useCallback(
      (ts: number) => {
        rafRef.current = 0;
        const full = fullRef.current;
        let revealed = revealedLenRef.current;

        if (revealed >= full.length) {
          lastTsRef.current = 0;
          return;
        }

        const last = lastTsRef.current || ts;
        const dt = Math.min(48, Math.max(MIN_FRAME_MS, ts - last));
        lastTsRef.current = ts;

        const behind = full.length - revealed;
        // Speed up when the network is ahead so we don't lag forever.
        const catchup =
          behind > 120
            ? Math.min(MAX_CATCHUP_CHARS_PER_SEC, BASE_CHARS_PER_SEC + behind * 1.2)
            : BASE_CHARS_PER_SEC;
        const step = Math.max(1, Math.ceil((catchup * dt) / 1000));
        revealed = Math.min(full.length, revealed + step);
        revealedLenRef.current = revealed;
        const done = revealed >= full.length;
        paint(full.slice(0, revealed), done);

        if (!done) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          lastTsRef.current = 0;
        }
      },
      [paint],
    );

    const ensureLoop = useCallback(() => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
    }, [tick]);

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          stopLoop();
          fullRef.current = "";
          revealedLenRef.current = 0;
          notifiedRef.current = false;
          setView("");
        },
        push(chunk: string) {
          if (!chunk) return;
          fullRef.current += chunk;
          ensureLoop();
        },
        replaceAll(text: string) {
          fullRef.current = text;
          // Jump reveal forward if replace shrinks; otherwise keep smooth catch-up.
          if (revealedLenRef.current > text.length) {
            revealedLenRef.current = text.length;
          }
          ensureLoop();
        },
        flush() {
          stopLoop();
          const full = fullRef.current;
          revealedLenRef.current = full.length;
          paint(full, true);
        },
        getLength() {
          return fullRef.current.length;
        },
      }),
      [ensureLoop, paint, stopLoop],
    );

    return (
      <div
        className={`stream-live stream-live-md w-full min-w-0 max-w-full ${className}`.trim()}
        aria-live="polite"
        aria-atomic="false"
      >
        <div
          className={`studio-md stream-md-partial m-0 w-full min-w-0 max-w-full text-sm leading-relaxed text-[var(--text-muted)] ${
            showCursor && view ? "stream-cursor-inline" : ""
          }`}
        >
          {view ? <Markdown components={components}>{view}</Markdown> : null}
        </div>
      </div>
    );
  },
);
