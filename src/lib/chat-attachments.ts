import {
  isImageUpload,
  MAX_IMAGE_UPLOAD_BYTES,
  prepareImageAttachmentDataUrl,
} from "@/lib/image-attachment";
import {
  isVideoUpload,
  MAX_VIDEO_UPLOAD_BYTES,
  prepareVideoAttachmentPayload,
  type VideoAttachmentPayload,
} from "@/lib/video-attachment";

export type ChatAttachmentKind = "text" | "image" | "video" | "binary";

export type ProcessedChatAttachment = {
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  content: string;
};

const TEXT_EXT = /\.(txt|md|json|csv|html|css|js|ts|tsx|jsx|xml|yml|yaml)$/i;

function isTextUpload(file: File): boolean {
  return file.type.startsWith("text/") || TEXT_EXT.test(file.name);
}

export function maxBytesForFile(file: File): number {
  if (isVideoUpload(file)) return MAX_VIDEO_UPLOAD_BYTES;
  return MAX_IMAGE_UPLOAD_BYTES;
}

export async function processFileForChatAttachment(file: File): Promise<ProcessedChatAttachment> {
  const limit = maxBytesForFile(file);
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw new Error(`"${file.name}" is too large. Max size is ${mb} MB.`);
  }

  if (isImageUpload(file)) {
    const content = await prepareImageAttachmentDataUrl(file);
    return {
      name: file.name,
      mimeType: content.startsWith("data:image/jpeg") ? "image/jpeg" : file.type || "image/jpeg",
      size: file.size,
      kind: "image",
      content,
    };
  }

  if (isVideoUpload(file)) {
    const payload: VideoAttachmentPayload = await prepareVideoAttachmentPayload(file);
    return {
      name: file.name,
      mimeType: file.type || "video/mp4",
      size: file.size,
      kind: "video",
      content: JSON.stringify(payload),
    };
  }

  if (isTextUpload(file)) {
    return {
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      kind: "text",
      content: await file.text(),
    };
  }

  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: "binary",
    content: "",
  };
}

/** Collect real files from a drop — ignores plain-text file paths the browser cannot read. */
export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];

  const fromList = Array.from(dt.files ?? []);
  if (fromList.length > 0) return fromList;

  const fromItems: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

export function droppedPathHint(dt: DataTransfer | null): string | null {
  if (!dt) return null;
  const text = dt.getData("text/plain")?.trim();
  if (!text) return null;
  if (/^file:\/\//i.test(text) || /^\/[^\s]+$/.test(text) || /^[A-Za-z]:\\/.test(text)) {
    return text;
  }
  return null;
}
