"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type StreamingTextHandle = {
  reset: () => void;
  push: (chunk: string) => void;
  replaceAll: (text: string) => void;
  getLength: () => number;
};

type StreamingTextProps = {
  className?: string;
  showCursor?: boolean;
};

/**
 * Imperative streaming surface — appends text nodes per chunk so the browser
 * paints incrementally without re-rendering the full React tree each token.
 */
export const StreamingText = forwardRef<StreamingTextHandle, StreamingTextProps>(
  function StreamingText({ className = "", showCursor = true }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const lengthRef = useRef(0);

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          const el = rootRef.current;
          if (!el) return;
          el.textContent = "";
          lengthRef.current = 0;
        },
        push(chunk: string) {
          if (!chunk) return;
          const el = rootRef.current;
          if (!el) return;
          el.appendChild(document.createTextNode(chunk));
          lengthRef.current += chunk.length;
        },
        replaceAll(text: string) {
          const el = rootRef.current;
          if (!el) return;
          el.textContent = text;
          lengthRef.current = text.length;
        },
        getLength() {
          return lengthRef.current;
        },
      }),
      [],
    );

    return (
      <div
        ref={rootRef}
        className={`stream-plain whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)] ${showCursor ? "stream-cursor" : ""} ${className}`.trim()}
      />
    );
  },
);
