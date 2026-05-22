"use client";

import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { stabilizeStreamingMarkdown } from "@/lib/streaming-markdown";

export type StreamingTextHandle = {
  reset: () => void;
  push: (chunk: string) => void;
  replaceAll: (text: string) => void;
  getLength: () => number;
};

type StreamingTextProps = {
  className?: string;
  showCursor?: boolean;
  markdownComponents?: Components;
};

/**
 * Live markdown stream — accumulates tokens and re-renders at most once per frame
 * so headings/bold/lists format during the reply (not raw # or **).
 */
export const StreamingText = forwardRef<StreamingTextHandle, StreamingTextProps>(
  function StreamingText(
    { className = "", showCursor = true, markdownComponents },
    ref,
  ) {
    const bufferRef = useRef("");
    const rafRef = useRef<number | null>(null);
    const [display, setDisplay] = useState("");

    const flush = () => {
      rafRef.current = null;
      setDisplay(stabilizeStreamingMarkdown(bufferRef.current));
    };

    const scheduleFlush = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flush);
    };

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          bufferRef.current = "";
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          setDisplay("");
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
      [],
    );

    return (
      <div className={`stream-live-md w-full min-w-0 ${className}`.trim()}>
        {display ? (
          <div className="studio-md stream-md-partial w-full min-w-0 max-w-full">
            <Markdown components={markdownComponents}>{display}</Markdown>
          </div>
        ) : null}
        {showCursor && display ? (
          <span className="stream-cursor-inline" aria-hidden />
        ) : null}
      </div>
    );
  },
);
