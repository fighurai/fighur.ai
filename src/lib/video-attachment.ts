/** Client-side video prep — sample frames for vision review. */

import { MAX_IMAGE_DATA_URL_CHARS } from "@/lib/image-attachment";

export const MAX_VIDEO_UPLOAD_BYTES = 40 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 180;
export const MAX_VIDEO_FRAMES = 5;

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v|avi|ogv)$/i;

export type VideoFrameSample = {
  label: string;
  dataUrl: string;
};

export type VideoAttachmentPayload = {
  durationSec: number;
  frames: VideoFrameSample[];
};

export function isVideoUpload(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

export function parseVideoAttachmentContent(raw: string): VideoAttachmentPayload | null {
  try {
    const parsed = JSON.parse(raw) as VideoAttachmentPayload;
    if (!parsed || typeof parsed.durationSec !== "number" || !Array.isArray(parsed.frames)) {
      return null;
    }
    if (!parsed.frames.every((f) => f && typeof f.label === "string" && typeof f.dataUrl === "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function videoPreviewDataUrl(content: string): string | null {
  return parseVideoAttachmentContent(content)?.frames[0]?.dataUrl ?? null;
}

function canvasToJpeg(canvas: HTMLCanvasElement): string | null {
  const qualities = [0.82, 0.72, 0.62, 0.5, 0.4];
  for (const q of qualities) {
    const jpeg = canvas.toDataURL("image/jpeg", q);
    if (jpeg.length <= MAX_IMAGE_DATA_URL_CHARS) return jpeg;
  }
  return null;
}

function waitForEvent(target: HTMLVideoElement, event: keyof HTMLMediaElementEventMap): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Could not read video frame"));
    };
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Sample evenly spaced frames so vision models can review short clips.
 */
export async function prepareVideoAttachmentPayload(file: File): Promise<VideoAttachmentPayload> {
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(
      `Video is too large. Max size is ${Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    );
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try {
    await waitForEvent(video, "loadedmetadata");

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Could not read video duration.");
    }
    if (duration > MAX_VIDEO_DURATION_SEC) {
      throw new Error(
        `Video is too long (${formatTimestamp(duration)}). Max length is ${formatTimestamp(MAX_VIDEO_DURATION_SEC)}.`,
      );
    }

    const frameCount = Math.min(
      MAX_VIDEO_FRAMES,
      Math.max(3, Math.ceil(duration / 15)),
    );
    const times: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = frameCount === 1 ? 0 : (duration * i) / (frameCount - 1);
      times.push(Math.min(duration - 0.05, Math.max(0, t)));
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create video canvas");

    const frames: VideoFrameSample[] = [];
    for (const t of times) {
      video.currentTime = t;
      await waitForEvent(video, "seeked");

      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvasToJpeg(canvas);
      if (!dataUrl) {
        throw new Error("Video frame is too large after compression. Try a shorter clip.");
      }

      frames.push({
        label: formatTimestamp(t),
        dataUrl,
      });
    }

    return { durationSec: duration, frames };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
