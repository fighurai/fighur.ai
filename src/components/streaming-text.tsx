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
  getLength: () => number;
};

type StreamingTextProps = {
  className?: string;
  showCursor?: boolean;
  onUpdate?: () => void;
  onFirstOutput?: () => void;
  components?: Components;
};

export const StreamingText = forwardRef<StreamingTextHandle, StreamingTextProps>(
  function StreamingText(
    { className = "", showCursor = true, onUpdate, onFirstOutput, components },
    ref,
  ) {
    const [view, setView] = useState("");
    const bufferRef = useRef("");
    const notifiedRef = useRef(false);
    const rafRef = useRef(0);
    const onUpdateRef = useRef(onUpdate);
    const onFirstOutputRef = useRef(onFirstOutput);
    onUpdateRef.current = onUpdate;
    onFirstOutputRef.current = onFirstOutput;

    const flush = useCallback(() => {
      rafRef.current = 0;
      const narration = streamingMarkdownView(bufferRef.current);
      if (narration && !notifiedRef.current) {
        notifiedRef.current = true;
        onFirstOutputRef.current?.();
      }
      setView(narration);
      onUpdateRef.current?.();
    }, []);

    const scheduleFlush = useCallback(() => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(flush);
    }, [flush]);

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
          }
          bufferRef.current = "";
          notifiedRef.current = false;
          setView("");
        },
        push(chunk: string) {
          if (!chunk) return;
          bufferRef.current += chunk;
          scheduleFlush();
        },
        replaceAll(text: string) {
          bufferRef.current = text;
          scheduleFlush();
        },
        getLength() {
          return bufferRef.current.length;
        },
      }),
      [scheduleFlush],
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
