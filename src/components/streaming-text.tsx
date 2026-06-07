"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

import { streamingNarration } from "@/lib/streaming-markdown";

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
};

/**
 * Imperative streaming surface — appends only new narration text per chunk so the
 * browser paints incrementally without re-rendering markdown on every token.
 */
export const StreamingText = forwardRef<StreamingTextHandle, StreamingTextProps>(
  function StreamingText({ className = "", showCursor = true, onUpdate }, ref) {
    const rootRef = useRef<HTMLParagraphElement>(null);
    const bufferRef = useRef("");
    const displayedRef = useRef("");

    const applyNarration = (narration: string) => {
      const el = rootRef.current;
      if (!el) return;

      const prev = displayedRef.current;
      if (narration === prev) return;

      if (prev.length > 0 && narration.startsWith(prev)) {
        const delta = narration.slice(prev.length);
        if (delta) el.appendChild(document.createTextNode(delta));
      } else {
        el.textContent = narration;
      }

      displayedRef.current = narration;
      onUpdate?.();
    };

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          bufferRef.current = "";
          displayedRef.current = "";
          const el = rootRef.current;
          if (el) el.textContent = "";
        },
        push(chunk: string) {
          if (!chunk) return;
          bufferRef.current += chunk;
          applyNarration(streamingNarration(bufferRef.current));
        },
        replaceAll(text: string) {
          bufferRef.current = text;
          applyNarration(streamingNarration(text));
        },
        getLength() {
          return bufferRef.current.length;
        },
      }),
      [onUpdate],
    );

    return (
      <p
        ref={rootRef}
        className={`stream-plain m-0 w-full min-w-0 max-w-full break-words whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)] ${showCursor ? "stream-cursor" : ""} ${className}`.trim()}
      />
    );
  },
);
